require('dotenv').config();
const app = require('commander');
const srv = require('./srv');

const version = '0.21.0';

global.thisVersion = version;

app.version(version)
    .command('run')
    .option('--no-upload', 'Dont upload torrent file to anidex')
    .option('--no-db', 'Dont update db entries')
    .option('--no-images', 'Dont download any images')
    .option('--stats', 'Write stats to the db')
    .option('-r, --resume <n>', 'Start at the specified page', parseInt)
    .action(srv.boot);

app.command('single <manga_id>')
    .option('--no-upload', 'Dont upload torrent file to anidex')
    .option('--no-db', 'Dont update db entries')
    .option('--no-images', 'Dont download any images')
    .option('--stats', 'Write stats to the db')
    .action(srv.single);

app.command('dump_archived')
    .action(srv.cachefile);

app.command('stringtest')
    .action(srv.stringtest);

app.parse(process.argv);
