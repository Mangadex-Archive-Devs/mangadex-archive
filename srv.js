const util = require('util');
const fs = require('fs');
const path = require('path');
const RateLimiter = require('limiter').RateLimiter;
const limiter = new RateLimiter(1, 1500); // 1 request every 1,5 seconds
const request = require('request');
const moment = require('moment');
const dom = require('cheerio');
const {getManga, getChapter} = require('./o7');

const ArchiveWorker = require('./archiveWorker');
const TorrentCreate = require('./torrent-processor/index.js');

const DbWrapper = require('./db');
const db = new DbWrapper();

function scrapeMangaList(page = 1, allDoneCb)
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
                }
            },
            (err, response, body) => {

                console.log("page request responeded with "+response.statusCode+" and "+body.length+" bytes");

                if (err || response.statusCode !== 200) {
                    console.error("Failed to retrieve manga list!");
                    allDoneCb();
                    return false;
                }

                // If no manga are found, we are probably at the end of the list

                let re = /There are no titles found with your search criteria/i;
                let match = body.toString().match(re);
                if (match && match.length > 0) {
                    console.log("End of mangalist reached.");
                    allDoneCb();
                    return true;
                }

                let manga = [];
                let $ = dom.load(body.toString());
                $('#content table tbody tr td:nth-child(2)').each((i, node) => {
                    try {
                        let url = $(node).find('a').attr('href');
                        manga.push({
                            id: parseInt(url.toString().split('/')[2]),
                            url: url,
                            title: $(node).text().trim()
                        });
                    } catch (e) {
                        console.log("Exception ", e);
                    }
                });
                //console.log(manga);

                let mangaChecklist = [];

                // TODO TEST
                //manga = [manga[14]];

                for (let i = 0; i < manga.length; i++) {

                    let _manga = manga[i];

                    if (db.isArchived(_manga.id)) {
                        console.log("manga #"+_manga.id+" ("+_manga.title+") is already archived.");
                    }

                    let mangaCheck = new Promise((resolve, reject) => {
                        let element = _manga;
                        try {
                            checkManga(element, (archiveWorker) => {
                                // Manga is now downloaded, archiveWorker holds all the necessary data

                                createTorrent(archiveWorker, () => {

                                    // Eventually
                                    db.setArchived(archiveWorker.getMangaId(), true);
                                    console.log("Manga "+archiveWorker.getMangaId()+" set to archived = true");
                                    resolve();
                                });

                            });
                        } catch (e) {
                            reject(e.toString());
                        }
                    });
                    mangaChecklist.push(mangaCheck);
                }

                Promise.all(mangaChecklist)
                    .then(() => {
                        console.log("Scraping of page "+page+" complete.");
                        limiter.removeTokens(1, () => {
                            scrapeMangaList(page+1, allDoneCb);
                        })
                    })
                    .catch((err) => {
                        console.error("Error thrown during scrape of page "+page+": "+err.toString());
                        allDoneCb();
                    });
            });
    });

}

function createTorrent(archiveWorker, cb)
{
    console.log("Creating torrent of "+archiveWorker.getAbsolutePath()+" ...");

    let torrentPath = path.join(process.env.BASE_DIR, 'torrents', archiveWorker.getMangaId()+"-"+archiveWorker.getDirname()+".torrent");

    TorrentCreate.generateTorrent(
        {
            torrent_name: archiveWorker.getDirname(),
            source_directory: archiveWorker.getAbsolutePath(),
            manga_id: archiveWorker.getMangaId(),
            torrent_file_path: torrentPath,    //Where the .torrent-file should be saved
        }, (err) => {
            if (err) {
                console.error("Failed to create torrent: "+err.message+", "+err.error.toString());
                throw new Error();
            } else {
                console.log("Torrent file created at "+torrentPath);
                cb();
            }
        }
    );
}

function uploadTorrent(torrentFilename, cb)
{
    console.log("Uploading torrent "+torrentFilename+" ...");
    // TODO

    cb();
}

/**
 * Checks if a manga meets the criteria to be archived
 *
 */
function checkManga(manga, cb)
{
    getManga(manga.id).then((mangaInfo) => {
        //console.log(mangaInfo, mangaInfo.manga.status, mangaInfo.chapter);

        if (mangaInfo.chapter == null || mangaInfo.chapter.length < 1)
            return;

        let statusCompleted = mangaInfo.manga.status.status === "completed";
        let lastUpload = -1;
        let hasEndTag = false;
        let volumeLow = Infinity;
        let volumeHigh = 0;
        let chapterLow = Infinity;
        let chapterHigh = 0;
        let numGaps = 0;

        //console.log(mangaInfo.chapter, mangaInfo.chapter.length);
        let chapters = [];

        for (let i = 0; i < mangaInfo.chapter.length; i++) {
            let ch = mangaInfo.chapter[i];

            // Only include english chapters
            if (ch.lang !== 'gb') continue;

            //console.log(chap);
            let rx = new RegExp('\[end\]$', 'i');
            hasEndTag = hasEndTag | rx.test(ch.ctitle);
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
            let groups = ch.groups.map(group => group.gname);

            let chapterInfo = {
                id: ch.cid,
                title: ch.ctitle,
                vol: ch.vol,
                ch: ch.ch,
                groups: groups
            };
            chapters.push(chapterInfo);
        }

        console.log("StatusCompleted = "+statusCompleted+", lastUpload = "+lastUpload+" ("+Math.abs(moment(lastUpload).diff(Date.now(), 'days'))+" days), hasEndTag = "+hasEndTag);
        //console.dir(mangaInfo, {depth:Infinity,color:true});
        if (hasEndTag && lastUpload > 0 && Math.abs(moment(lastUpload).diff(Date.now(), 'days')) > 7 && statusCompleted && numGaps < 1) {

            console.log("Manga "+manga.id+" "+manga.title+" is archiveable!");

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
                artist: mangaInfo.manga.artist,
                author: mangaInfo.manga.author,
                genres: genres,
            }, limiter, cb);
            //console.log("Created new archiveWorker for title "+manga.title);

            // Foreach chapter we want to archive, fetch the detailed chapter data, which contains pages and more info
            chapters.forEach((chapter) => {

                limiter.removeTokens(1, () => {
                    getChapter(chapter.id).then((chapterInfo) => {
                        //console.dir(chapterInfo, {depth:Infinity,color:true});
                        worker.addChapter({
                            id: chapter.id,
                            title: chapter.title,
                            vol: chapter.vol,
                            ch: chapter.ch,
                            groups: chapter.groups,
                            url: chapterInfo.dataurl,
                            pages: chapterInfo.pages
                        });
                    });
                });

            });
        }
    });
}

function archiveManga(manga, cb)
{
    console.log("Archieving manga #"+manga.id+" ...");
    cb();
}

const boot = function(cmd)
{
    db.ready(run);
};

const run = function() {

    let delay = (process.env.SCRAPE_INTERVAL_SECONDS || 15 * 60);

    scrapeMangaList(1, () => {
        console.log("End of run cycle. Sleeping "+delay+" seconds until next cycle.");
        setTimeout(run, delay * 1000);
    });

};

module.exports = { boot };