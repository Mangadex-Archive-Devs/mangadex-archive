const fs = require('fs');
const sqlite = require('sqlite3');
const notify = require('./notify');

var method = DbWrapper.prototype;

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
    this._archivedEntries = [];

    let loadDb = [
        new Promise((resolve, reject) => {
            this._db.all("SELECT * FROM archived", (err, rows) => {
                if (err) {
                    console.error("Failed to read from db");
                    notify.err("Failed to read from db! "+err.toString());
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
    }).catch((err) => {
        console.error("DB error", err);
    });
};

method.getArchivedList = function (callback) {
    this._db.all("SELECT * FROM archived", (err, rows) => {
        if (err) {
            console.error("Failed to read from db");
            notify.err("Failed to read from db! "+err.toString());
            process.exit(1);
        }
        callback(rows);
    });
};

method.isArchived = function (mangaId) {
    return this._archivedEntries.indexOf(mangaId) !== -1;
};

method.setArchived = function (mangaId, anidexId = 0, isArchived = true) {
    if (isArchived) {
        try {
            let stmt = this._db.prepare("INSERT INTO archived VALUES (?, ?, ?)");
            if (process.flags.db)
                stmt.run(mangaId, Date.now(), anidexId);
            this._archivedEntries.push(mangaId);
        } catch (e) {
            notify.err("SQL Error: "+e.toString());
            console.error("SQL Error:",e);

        }
    } else {
        try {
            if (process.flags.db)
                this._db.exec("REMOVE FROM archived WHERE mangaId = "+mangaId);
            let index = this._archivedEntries.indexOf(mangaId);
            if (index !== -1)
                delete this._archivedEntries[index];
        } catch (e) {
            console.error("SQL Error:",e);
            notify.err("SQL Error: "+e.toString());
        }
    }
};

method.addStats = function (mangaId, mangaTitle, volStart, volCount, chStart, chCount, chGaps, lastUpload, hasEndTag, status, isArchiveable, description) {
    try {
        let stmt = this._db.prepare("REPLACE INTO stats VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        stmt.run(
            mangaId, mangaTitle, volStart, volCount, chStart, chCount, chGaps, lastUpload, hasEndTag, status, isArchiveable, description
        );
    } catch (e) {
        console.error("Failed to write stats into db:", e);
        notify.err("stats SQL Error: "+e.toString());
    }
};

module.exports = DbWrapper;