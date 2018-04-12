const fs = require('fs');
const sqlite = require('sqlite3');

var method = DbWrapper.prototype;

const updStmt = "UPDATE manga SET title = ?, path = ?, torrentFilename = ?, timestamp = ? WHERE id = ?";
const insertStmt = "INSERT INTO manga VALUES (?, ?, ?, ?, ?)";

function DbWrapper(dbFilename = 'manga.db') {

    // Open db
    if (fs.existsSync(dbFilename)) {
        this._db = new sqlite.Database(dbFilename);
        console.log("Database loaded.");
    } else {
        let sql = fs.readFileSync('dbschema.sql');
        console.log("sql: ",sql.toString());
        this._db = new sqlite.Database('manga.db');
        this._db.exec(sql.toString());
        console.log("Database created.");
    }
}

method.ready = function (cb)
{
    this._mangaEntries = [];
    this._archivedEntries = [];

    let loadDb = [
        new Promise((resolve, reject) => {
            this._db.all("SELECT * FROM manga", (err, rows) => {
                if (err) {
                    console.error("Failed to read from db");
                    process.exit(1);
                }
                this._mangaEntries = rows;
                resolve();
            });
        }),
        new Promise((resolve, reject) => {
            this._db.all("SELECT * FROM archived", (err, rows) => {
                if (err) {
                    console.error("Failed to read from db");
                    process.exit(1);
                }
                this._archivedEntries = rows.map((e => e.mangaId));
                resolve();
            });
        })
    ];

    Promise.all(loadDb).then(() => {
        //console.log("DB State:", this);
        cb();
    });
};

method.isArchived = function (mangaId) {
    return this._archivedEntries.indexOf(mangaId) !== -1;
};

method.setArchived = function (mangaId, isArchived = true) {
    if (isArchived) {
        try {
            this._db.exec("INSERT INTO archived VALUES ("+mangaId+", "+Date.now()+")");
            this._archivedEntries.push(mangaId);
        } catch (e) {}
    } else {
        try {
            this._db.exec("REMOVE FROM archived WHERE mangaId = "+mangaId);
            let index = this._archivedEntries.indexOf(mangaId);
            if (index !== -1)
                delete this._archivedEntries[index];
        } catch (e) {}
    }
};

method.hasManga = function (mangaId) {
    return method.getManga(mangaId) != null;
};

method.getManga = function (mangaId) {
    this._mangaEntries.forEach((element) => {
        if (element.id === mangaId)
            return element;
    });
    return null;
};

method.setManga = function (manga) {
    this._mangaEntries.forEach((element, index) => {
        if (element.id === manga.id) {
            this._mangaEntries[index] = manga;
            let stmt = this._db.prepare(updStmt);
            stmt.run(manga.title, manga.path, manga.torrentFilename, Date.now(), manga.id);
            return;
        }
    });
    this._mangaEntries.push(manga);
    let stmt = this._db.prepare(insertStmt);
    stmt.run(manga.id, manga.title, manga.path, manga.torrentFilename, Date.now());
};

module.exports = DbWrapper;