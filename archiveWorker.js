const fs = require('fs');
const path = require('path');
const util = require('util');
const events = require('events');

var method = ArchiveWorker.prototype;

function ArchiveWorker(mangaInfo, limiter, callback) {

    this._manga = mangaInfo;
    this._limiter = limiter;
    this._callback = callback;
    this._chapters = [];
    this._promiseWorkers = [];

}

function startPackingTorrent()
{


    // Eventually
    this._callback();
}

function getMangaDirname()
{

}

function getChapterDirname(chapter)
{

}

method.addChapter = function (chapter)
{
    // Add new chapter downloader
    let promiseWorker = new Promise((resolve, reject) => {
        // Create path & dirs
        let dirname = path.join(process.env.BASE_DIR, getMangaDirname());
        fs.mkdirSync(dirname);
        dirname = path.join(dirname, getChapterDirname(chapter));
        fs.mkdirSync(dirname);

        chapter.pages.forEach((page) => {
            this._limiter.removeToken(1, () => {
                console.log(chapter.dataurl.toString() + page);
            });
        });
    });
    this._promiseWorkers.push(promiseWorker);

    if (this._promiseWorkers.length === this._manga.numChapters) {
        // Last chapter worker has been added. Time to start the downloads
        Promise.all(this._promiseWorkers).then(() => {
            console.log(util.format("Archive Worker finished downloading %d chapters.", this._manga.numChapters));
            startPackingTorrent();
        }).catch((reason) => {
            console.error(util.format("Archive Worker failed while trying to download chapter. Reason: %s", reason.toString()))
        });
    }
};

module.exports = ArchiveWorker;