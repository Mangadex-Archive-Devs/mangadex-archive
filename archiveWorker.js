const fs = require('fs');
const path = require('path');
const util = require('util');
const moment = require('moment');
const sanitize = require("sanitize-filename");
const events = require('events');
const request = require('request');
const RateLimiter = require('limiter').RateLimiter;
const imageLimiter = new RateLimiter(1, 500); // x requests every y ms

var method = ArchiveWorker.prototype;

function ArchiveWorker(mangaInfo, limiter, callback) {

    this._manga = mangaInfo;
    this._limiter = limiter;
    this._callback = callback; // function (archiveWorker)
    this._chapters = [];
    this._promiseWorkers = [];
    this._dirname = null;

}

method.getMangaDescription = function ()
{
    return this._manga.description;
};

method.getMangaDirname = function ()
{
    //return util.format("%s (%s)", sanitize(this._manga.title), moment(Date.now()).format('dd-mmm-yyyy'));
    //console.log("getMangaDirname", this._manga);
    return sanitize(this._manga.title);
};

method.getChapterDirname = function (chapter)
{
    let chapterString = chapter.ch.toString().replace('x', '.').replace('p', '.');
    let [primary, secondary] = chapterString.split(".");
    if (secondary !== undefined) { //Checks that secondary number exists. e.g. `7` => `7`. If you use `7.`, then- Wait, why you using `7.`?
        chapterString = [primary.padStart(3, "0"), secondary].join(".");
    } else if (secondary === "") {
        console.warn(`Trailing "." for Chapter: ${chapterString}`);
    } else {
        chapterString = primary.padStart(3, "0");
    }
    //let chapterString = chapter.ch.toString().padStart(3, '0');
    let volumeString = chapter.vol.toString().padStart(2, '0');
    let groupString = chapter.groups.map(grp => "["+grp+"]").join(' ');

    //console.log("getChapterDirname", this._manga);
    return sanitize(util.format("%s - c%s (v%s) %s", this._manga.title, chapterString, volumeString, groupString));
};

method.getAbsolutePath = function () {
    return this._dirname;
};

method.getMangaName = function () {
    return this.getMangaDirname();
};

method.getMangaId = function () {
    return this._manga.id;
};

method.addChapter = function (chapter)
{
    //console.log(chapter);
    let self = this;

    // Add new chapter downloader
    let promiseWorker = new Promise((resolve, reject) => {

        // Create path & dirs
        self._dirname = path.join(process.env.BASE_DIR, self.getMangaDirname());

        if (!fs.existsSync(self._dirname))
            fs.mkdirSync(self._dirname);
        let dirname = path.join(self._dirname, self.getChapterDirname(chapter));
        if (!fs.existsSync(dirname))
            fs.mkdirSync(dirname);

        console.log(dirname);

        let imageWorkers = [];

        for (let i = 0; i < chapter.pages.length; i++) {
            let page = chapter.pages[i];
            let pageNum = 1+i;
            let ext = page.split('.')[1];
            let destinationPath = path.join(dirname, pageNum.toString().padStart(3, '0')+"."+ext);

            if (fs.existsSync(destinationPath)) {
                //console.log("File "+destinationPath+" already exists. Skipping...");
                continue;
            }

            imageWorkers.push(new Promise((resolve, reject) => {

                imageLimiter.removeTokens(1, () => {

                    let imgUrl = chapter.url.toString() + page;

                    request.get(imgUrl).on('response', (res) => {
                        if (res.statusCode !== 200)
                            reject("Failed to download "+imgUrl+", statusCode: "+res.statusCode);

                        //console.log(i, imgUrl, " -> ", destinationPath);

                        res.pipe(fs.createWriteStream(destinationPath));
                        res.on('end', resolve);
                    });
                });
            }));
        }
        Promise.all(imageWorkers).then(resolve).catch((reason) => {
            console.error("Imageworker threw an exception: "+reason);
            reject();
        });
    });
    self._promiseWorkers.push(promiseWorker);

    if (self._promiseWorkers.length === self._manga.numChapters) {
        // Last chapter worker has been added. Time to start the downloads
        Promise.all(self._promiseWorkers).then(() => {

            console.log(util.format("Archive Worker finished downloading %d chapters.", self._manga.numChapters));
            self._callback(self);

        }).catch((reason) => {

            console.error(util.format("Archive Worker failed while trying to download chapter. Reason: %s", reason.toString()));
            throw new Error();

        });
    }
};

module.exports = ArchiveWorker;