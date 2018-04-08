const util = require('util');
const fs = require('fs');
const RateLimiter = require('limiter').RateLimiter;
const TokenBucket = require('limiter').TokenBucket;
const events = require('events');
const limiter = new RateLimiter(1, 'second');
const request = require('request');
const dom = require('cheerio');

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

                manga.forEach((element) => {

                    if (db.isArchived(element.id)) {
                        console.log("manga #"+element.id+" ("+element.title+") is already archived.");
                    }

                    checkManga(element, () => {
                        // Manga is not archived and meets the condition for archival
                        archiveManga(element, () => {
                            
                        });
                    });

                });
            });
    });

}

/** Checks if a manga meets the criteria to be archived **/
function checkManga(manga, cb)
{
    console.log("checking...");
    cb();
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