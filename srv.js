const util = require('util');
const fs = require('fs');
const sanitize = require("sanitize-filename");
const RateLimiter = require('limiter').RateLimiter;
const TokenBucket = require('limiter').TokenBucket;
const events = require('events');
const limiter = new RateLimiter(1, 'second');
const request = require('request');
const moment = require('moment');
const dom = require('cheerio');
const {getManga, getChapter} = require('./o7');

const ArchiveWorker = require('./archiveWorker');

const DbWrapper = require('./db');
const db = new DbWrapper();

async function scrapeMangaList(page = 1)
{
    let url = util.format("%s/titles/2/%d/", (process.env.BASE_URL || 'https://mangadex.org'), page);
    limiter.removeTokens(1, () => {

        request.get(
            {
                url: url,
                headers: {
                    'cookie': 'mangadex_title_mode=1'
                }
            },
            (err, response, body) => {
                if (err || response.statusCode !== 200) {
                    console.error("Failed to retrieve manga list!");
                    return false;
                }

                /*
                fs.writeFileSync("debug-page.html", body.toString());
                let rx = new RegExp("\\/manga\\/(\\d+)\\/", 'g');
                let match;

                while (match = rx.exec(body.toString())) {
                    mangaIds.push(match[1]);
                }
                console.log(url, mangaIds.length, mangaIds);
                */

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

                //manga.forEach((element) => {
                let element = manga[14];

                    if (db.isArchived(element.id)) {
                        console.log("manga #"+element.id+" ("+element.title+") is already archived.");
                    }

                    checkManga(element, () => {
                        // Manga is not archived and meets the condition for archival
                        archiveManga(element, () => {
                            console.log("Archiving...");
                        });
                    });

                //});
            });
    });

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
        if (hasEndTag && Math.abs(moment(lastUpload).diff(Date.now(), 'days')) > 7 && statusCompleted && numGaps < 1) {

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
            }, limiter);

            // Foreach chapter we want to archive, fetch the detailed chapter data, which contains pages and more info
            chapters.forEach((chapter) => {

                limiter.removeTokens(1, () => {
                    console.log(chapter.id);
                    getChapter(chapter.id).then((chapterInfo) => {
                        console.dir(chapterInfo, {depth:Infinity,color:true});
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

            //cb();
        }
    });
}

/**
 * Takes in a struct as returned from getManga() and returns a directoryname with all relevant info
 */
function buildMangaDirname(manga, mangaInfo, numbers)
{
    return process.env.BASE_DIR + '/' + sanitize(manga.title) + '/';
}

function buildChapterDirname(manga, mangaInfo, numbers)
{

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

    scrapeMangaList()
        .then(function () {
            console.log("finished");
            setTimeout(function () {
                run();
            }, (process.env.SCRAPE_INTERVAL_SECONDS || 15 * 60) * 1000);
        });
};

module.exports = { boot };