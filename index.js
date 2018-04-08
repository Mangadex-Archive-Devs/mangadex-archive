const util = require('util');
const fs = require('fs');
const http2 = require('http2');
const sqlite = require('sqlite3').verbose();
require('dotenv').config();
const app = require('commander');
const srv = require('./srv');

app.version('0.0.1')
    .command('run')
    .option('-d, --dryrun', 'Run without actual write/upload operations')
    .action(srv.boot);

app.parse(process.argv);
