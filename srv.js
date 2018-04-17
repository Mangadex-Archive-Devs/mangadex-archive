const util = require('util');
const fs = require('fs');
const path = require('path');
const RateLimiter = require('limiter').RateLimiter;
const limiter = new RateLimiter(1, 2000); // x requests every y ms
const request = require('request');
const moment = require('moment');
const dom = require('cheerio');
const Entities = require('html-entities').AllHtmlEntities;
const entities = new Entities();
//const {getManga, getChapter} = require('./o7');
//const {getManga, getChapter} = require('mangadex-req');
const {getManga, getChapter} = require('./md-api.js');

const ArchiveWorker = require('./archiveWorker');
const TorrentCreate = require('mangadex-archive-torrent-processor');

const DbWrapper = require('./db');
const db = new DbWrapper();

const notify = require('./notify');

let torrentCreationQueue = [];
let torrentUploadQueue = [];

let _isStopRequested = false;

function nextPage(page, allPagesDoneCb)
{
    let delay = 5;
    console.log("nextPage("+page+") in "+delay+" seconds...");
    setTimeout(() => {
        scrapeMangaList(page, allPagesDoneCb)
    }, delay * 1000);
}

function scrapeMangaList(page = 1, allPagesDoneCb)
{
    let url = util.format("%s/titles/2/%d/", (process.env.BASE_URL || 'https://mangadex.org'), page);
    console.log("scrapeMangaList("+page+") : "+url);
    limiter.removeTokens(1, () => {

        console.log("Firing page request...");

        request.get(
            {
                url: url,
                headers: {
                    'cookie': 'mangadex_title_mode=1'
                },
                timeout: (process.env.REQUEST_TIMEOUT || 5) * 1000
            },
            (err, response, body) => {

                try {

                    console.log("page request responeded with "+response.statusCode+" and "+body.length+" bytes");

                    if (err || response.statusCode !== 200) {
                        console.error("Failed to retrieve manga list!");
                        notify.err("Failed to retrieve manga list, response code: "+response.statusCode+", err: "+err.toString());
                        nextPage(page+1, allPagesDoneCb);
                        return false;
                    }

                    // If no manga are found, we are probably at the end of the list

                    let re = /There are no titles found with your search criteria/i;
                    let match = body.toString().match(re);
                    if (match && match.length > 0) {
                        console.log("End of mangalist reached.");
                        allPagesDoneCb();
                        return true;
                    }

                    let manga = [];
                    let $ = dom.load(body.toString());
                    $('#content table tbody tr td:nth-child(3)').each((i, node) => {
                        try {
                            let url = $(node).find('a').attr('href');
                            manga.push({
                                id: parseInt(url.toString().split('/')[2]),
                                url: url,
                                title: entities.decode($(node).find('a').attr('title') || $(node).text().trim())
                            });
                        } catch (e) {
                            console.log("Exception ", e);
                        }
                    });
                    //console.log(manga);

                    let mangaChecklist = [];

                    // TODO TEST, must be manga that are actually archiveable
                    //manga = [manga[1], manga[2]];

                    if (manga.length < 1) {
                        console.log("Page "+page+" has no manga that can be archived.");
                        limiter.removeTokens(1, () => {
                            nextPage(page+1, allPagesDoneCb);
                            return true;
                        });
                    } else {

                        for (let i = 0; i < manga.length; i++) {

                            let element = manga[i];

                            if (db.isArchived(element.id)) {
                                console.log("manga #"+element.id+" ("+element.title+") is already archived.");
                                continue;
                            }

                            let mangaCheck = new Promise((resolve, reject) => {
                                try {
                                    checkManga(element, (archiveWorker) => {
                                        // Manga is now downloaded, archiveWorker holds all the necessary data

                                        if (archiveWorker != null)
                                            enqueueTorrentCreation(archiveWorker); // if we get an archive worker, add it to the queue

                                        resolve(); // mark this manga as checked
                                    });
                                } catch (e) {
                                    reject(e);
                                }
                            });
                            mangaChecklist.push(mangaCheck);
                        }

                        if (mangaChecklist.length < 1) {
                            console.warn("mangaChecklist on page "+page+" is empty, this is not supposed to happen...");
                            notify.warn("Page "+page+" has empty checklist");
                            clearQueues();
                            nextPage(page+1, allPagesDoneCb);
                        } else {
                            Promise.all(mangaChecklist)
                                .then(() => {
                                    // All manga have been downloaded and the queues have been filled, proceed with torrent creation and uploading
                                    console.log("Scraping of page "+page+" complete.");

                                    processTorrentCreationQueue(() => {
                                        // after that...
                                        processTorrentUploadQueue(() => {
                                            // all uploaded...

                                            // clear the queues
                                            clearQueues();

                                            // start on the next page
                                            nextPage(page+1, allPagesDoneCb);
                                        });
                                    });
                                })
                                .catch((err) => {
                                    console.error("Error thrown during scrape of page "+page, err);
                                    notify.err("Error thrown during scrape of page "+page+": "+err.toString());
                                    clearQueues();
                                    nextPage(page+1, allPagesDoneCb);
                                });
                        }

                    }

                } catch (err) {
                    console.error("Page crawl error on page", page, err);
                    notify.err("Page crawl error on page "+page+": "+err.toString());
                    clearQueues();
                    nextPage(page+1, allPagesDoneCb);
                }

            });
    });

}

function enqueueTorrentCreation(archiveWorker)
{
    console.log("Torrent Creation of "+archiveWorker.getAbsolutePath()+" is queued.");

    let torrentInfo = {
        mangaId: archiveWorker.getMangaId(),
        mangaTitle: archiveWorker.getMangaName(),
        mangaPath: archiveWorker.getAbsolutePath(),
        torrentPath: path.join(process.env.BASE_DIR, 'torrents', archiveWorker.getMangaId()+"-"+archiveWorker.getMangaName()+".torrent"),
    };
    torrentCreationQueue.push(torrentInfo);
}

function clearQueues()
{
    torrentCreationQueue = [];
    torrentUploadQueue = [];
}

function processTorrentCreationQueue(finishedCb)
{
    if (process.flags.images && torrentCreationQueue.length > 0) {
        console.log("Processing TorrentCreation of "+torrentCreationQueue.length+" torrents ...");

        let fn = (torrentInfo, index) => {
            if (torrentInfo == null)
                finishedCb();
            else {
                TorrentCreate.generateTorrent(
                    {
                        torrent_name: torrentInfo.mangaTitle,
                        source_directory: torrentInfo.mangaPath,
                        manga_id: torrentInfo.mangaId,
                        torrent_file_path: torrentInfo.torrentPath,    //Where the .torrent-file should be saved

                    }, (err) => {
                        if (err) {
                            console.error("Failed to create torrent: " + err.message + ", " + (err.error ? err.error.toString() : ""));
                            notify.err("Failed to create torrent: "+err.message+", "+(err.error ? err.error.toString() : ""));
                        } else {
                            console.log("Torrent file created at "+torrentInfo.torrentPath);
                            let uploadInfo = {
                                mangaId: torrentInfo.mangaId,
                                mangaTitle: torrentInfo.mangaTitle,
                                title: torrentInfo.mangaTitle,
                                description: "TODO",
                                torrent: torrentInfo.torrentPath
                            };
                            torrentUploadQueue.push(uploadInfo);
                        }
                        index++;
                        fn(torrentCreationQueue[index], index); // Next
                    }
                )
            }
        };
        fn(torrentCreationQueue[0], 0);
    } else {
        finishedCb();
    }
}

function processTorrentUploadQueue(finishedCb)
{
    if (torrentUploadQueue.length > 0) {
        console.log("Processing TorrentUpload of " + torrentUploadQueue.length + " torrents ...");

        let fn = (uploadInfo, index) => {
            if (uploadInfo == null)
                finishedCb();
            else {
                TorrentCreate.postTorrent(
                    {
                        torrent_file_path: uploadInfo.torrent,
                        anidex_description: uploadInfo.description,
                        anidex_hentai: false,
                        anidex_subcat_id: process.env.ANIDEX_SUBCAT_ID || 7,
                        anidex_api_key: process.env.ANIDEX_APIKEY,
                        anidex_private: process.env.ANIDEX_PRIVATE || 0,
                        anidex_debug: process.env.ANIDEX_DEBUG || (process.flags.upload ? 0 : 1)

                    }, (result) => {
                        if (result == null) {
                            console.error("Failed to upload torrent " + uploadInfo.torrent + "!");
                            notify.err("Failed to upload torrent " + uploadInfo.torrent);
                        } else if (result > 0) {
                            console.log("Successfully uploaded torrent for manga " + uploadInfo.mangaTitle + ", torrentId = " + result);
                            db.setArchived(uploadInfo.mangaId, result, true);
                            console.log("Manga " + uploadInfo.mangaId + " set to archived = true");
                            notify.warn("New Manga archived: " + uploadInfo.mangaTitle + " at https://mangadex.org/manga/" + uploadInfo.mangaId + " on anidex: https://anidex.info/torrent/" + result);
                        } else {
                            console.log("Successfully uploaded torrent, but torrentId was invalid. This probably means, it was a test upload.");
                            notify.warn("New Manga (TEST) archived: " + uploadInfo.mangaTitle + " at https://mangadex.org/manga/" + uploadInfo.mangaId + " on anidex: https://anidex.info/torrent/" + result);
                        }
                        index++;
                        fn(torrentUploadQueue[index], index); // Next
                    }
                )
            }
        };
        fn(torrentUploadQueue[0], 0);
    } else {
        finishedCb();
    }
}

/**
 * Checks if a manga meets the criteria to be archived
 *
 */
function checkManga(manga, archiveWorkerResult)
{
    getManga(manga.id).then((mangaInfo) => {
        try {
            //console.log(mangaInfo, mangaInfo.manga.status, mangaInfo.chapter);

            // Fix fields
            mangaInfo.manga.description = entities.decode(mangaInfo.manga.description);

            if (mangaInfo.chapter == null || mangaInfo.chapter.length < 1) {
                archiveWorkerResult(null);
                return;
            }

            let statusCompleted = mangaInfo.manga.status === "completed";
            let lastUpload = -1;
            let hasEndTag = false;
            let volumeLow = Infinity;
            let volumeHigh = 0;
            let chapterLow = Infinity;
            let chapterHigh = 0;
            let chapterGapCount = 0;

            //console.log(mangaInfo.chapter, mangaInfo.chapter.length);
            let chapters = [];

            for (let i = 0; i < mangaInfo.chapter.length; i++) {
                let ch = mangaInfo.chapter[i];
                ch.ctitle = entities.decode(ch.ctitle);

                // Only include english chapters
                if (ch.lang !== 'gb') continue;

                // Exclude broken chapter numbers
                if (isNaN(ch.ch)) continue;

                //console.log(chap);
                let rx = /\[end\]/i;
                hasEndTag = hasEndTag || rx.test(ch.ctitle);
                if (ch.timestamp > lastUpload)
                    lastUpload = ch.timestamp;
                // Update ch/vol numbers
                volumeLow = Math.min(volumeLow, ch.vol);
                chapterLow = Math.min(chapterLow, ch.ch);
                volumeHigh = Math.max(volumeHigh, ch.vol);
                chapterHigh = Math.max(chapterHigh, ch.ch);

                /*
                let groups = [];
                for (let j = 0; j < ch.groups.length; j++) {
                    groups.push(ch.groups[j].gname);
                }
                */
                let groups = ch.groups.map(group => entities.decode(group.group));

                let chapterInfo = {
                    id: ch.cid,
                    title: ch.ctitle,
                    vol: ch.vol,
                    ch: ch.ch,
                    groups: groups
                };
                chapters.push(chapterInfo);
            }

            // Check chapter gaps
            //console.log(manga.title, chapterLow, chapterHigh);
            // Array of bool, defaults to false
            // with one entry for each expected chapter, starting at zero
            let chapterIds = new Array(parseInt(chapterHigh) +1).fill(false);
            for (let i = 0; i < chapters.length; i++) {
                // every chapter gets rounded down, ch08 == ch08.5 and its key set to true
                chapterIds[parseInt( chapters[i].ch )] = true; // This chapter id exists
            }

            for (let i = 0; i < chapterHigh; i++) {
                if (!chapterIds[i])
                    chapterGapCount++;
            }
            //chapterGapCount = chapterIds.filter((exists) => !exists).length;

            if (!chapterIds[0]) // Ch.00 doesnt count as a gap, because we dont know if the manga is supposed to have one.
                chapterGapCount = Math.max(0, chapterGapCount - 1);

            //console.log("StatusCompleted = "+statusCompleted+", lastUpload = "+lastUpload+" ("+Math.abs(moment(lastUpload).diff(Date.now(), 'days'))+" days), hasEndTag = "+hasEndTag+" gapCount = "+chapterGapCount+", startsAtCh = "+chapterLow);
            //console.dir(mangaInfo, {depth:Infinity,color:true});
            let condition =
                hasEndTag
                && lastUpload > 0
                && Math.abs(moment(lastUpload).diff(Date.now(), 'days')) > 7
                && statusCompleted
                && chapterGapCount < 1
                && chapterLow <= 1;

            if (hasEndTag && !statusCompleted) {
                // Notify
                console.warn("Manga #"+manga.id+" "+manga.title+" has an [END] Tag, but is not set as completed.");
                notify.warn("Manga #"+manga.id+" "+manga.title+" has an [END] Tag, but is not set as completed. https://mangadex.org/manga/"+manga.id);
            }

            if (process.flags.stats) {
                db.addStats(manga.id, manga.title, volumeLow, volumeHigh-volumeLow+1, chapterLow, chapters.length, chapterGapCount, lastUpload, hasEndTag, statusCompleted ? "Completed" : "Ongoing", condition, mangaInfo.manga.description);
            }

            if (condition) {

                console.log("Manga "+manga.id+" "+manga.title+" is archiveable!");
                notify.info("Manga "+manga.id+" "+manga.title+" is archiveable! https://mangadex.org/manga/"+manga.id);

                let genres = mangaInfo.manga.genres.map(gen => gen.genre);

                // Spawn a new worker
                let worker = new ArchiveWorker({
                    id: manga.id,
                    title: manga.title,
                    url: manga.url,
                    volStart: volumeLow,
                    volEnd: volumeHigh,
                    chStart: chapterLow,
                    chEnd: chapterHigh,
                    numChapters: chapters.length,
                    lastUpload: lastUpload,
                    description: mangaInfo.manga.description,
                    artist: mangaInfo.manga.artist,
                    author: mangaInfo.manga.author,
                    genres: genres,
                }, limiter, () => {
                    // Archive worker created
                    archiveWorkerResult(worker);
                });
                //console.log("Created new archiveWorker for title "+manga.title);

                // Foreach chapter we want to archive, fetch the detailed chapter data, which contains pages and more info
                for (let i = 0; i < chapters.length; i++) {
                    let chapter = chapters[i];

                    if (!chapter.id || isNaN(chapter.id) || chapter.id < 1)
                        continue;

                    limiter.removeTokens(1, () => {
                        getChapter(chapter.id).then((chapterInfo) => {

                            if (chapterInfo) { // chapterInfo is null when the parser failed
                                worker.addChapter({
                                    id: chapter.id,
                                    title: chapter.title,
                                    vol: chapter.vol,
                                    ch: chapter.ch,
                                    groups: chapter.groups,
                                    url: chapterInfo.dataurl,
                                    pages: chapterInfo.pages
                                });
                            }

                        }).catch((err) => {
                            console.error(err);
                            notify.err(err);
                            archiveWorkerResult(null);
                        });
                    });
                }
            } else {
                // Conditions not met
                archiveWorkerResult(null);
            }

        } catch (err) {
            // Any reson for not archieving this was given. // FIXME
            console.error("Error while checking manga "+manga.id+": "+err.toString());
            notify.err("Error while checking manga "+manga.id+": "+err.toString());
            archiveWorkerResult(null);
        }
    });
}

function isStopRequested()
{
    if (fs.existsSync('./stop')) {
        fs.unlinkSync('./stop');
        return true;
    }
    return _isStopRequested;
}

function requestStop()
{
    _isStopRequested = true;
}

const boot = function(cmd)
{
    process.flags = {
        db: cmd.db,
        upload: cmd.upload,
        images: cmd.images,
        stats: cmd.stats || false
    };

    db.ready(() => {
        run(cmd.resume || 1);
    });

};

const run = function(pageStart = 1) {

    let delay = (process.env.SCRAPE_INTERVAL_SECONDS || 15 * 60);

    scrapeMangaList(pageStart, () => {

        if (isStopRequested()) {
            console.log("Exiting...");
            process.exit(0);
            return;
        }

        console.log("End of run cycle. Sleeping "+delay+" seconds until next cycle.");
        setTimeout(run, delay * 1000);
    });

};

module.exports = { boot };