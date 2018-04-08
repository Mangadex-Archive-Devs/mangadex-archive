const util = require('util');
const fs = require('fs');
const http2 = require('http2');
const sqlite = require('sqlite3').verbose();
require('dotenv').config();
const app = require('commander');
const srv = require('./srv');

var db;

// Open db
if (fs.existsSync('manga.db')) {
    db = new sqlite.Database('manga.db')
    console.log("Database loaded.");
} else {
    let sql = fs.readFileSync('dbschema.sql');
    console.log("sql: ",sql.toString());
    db = new sqlite.Database('manga.db');
    db.exec(sql.toString());
    console.log("Database created.");
}

app.version('0.0.1')
    .command('run')
    .option('-d, --dryrun', 'Run without actual write/upload operations')
    .action(srv.run);

//app.parse(process.argv);
