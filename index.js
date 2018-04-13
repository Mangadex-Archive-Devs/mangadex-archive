const util = require('util');
const fs = require('fs');
const http2 = require('http2');
const sqlite = require('sqlite3').verbose();
require('dotenv').config();
const app = require('commander');
const srv = require('./srv');

app.version('0.9.0')
    .command('run')
    .option('--no-upload', 'Dont upload torrent file to anidex')
    .option('--no-db', 'Dont update db entries')
    .option('--no-images', 'Dont download any images')
    .option('--write-stats', 'Write stats to the db')
    .action(srv.boot);

app.parse(process.argv);
