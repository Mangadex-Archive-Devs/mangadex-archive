const fs = require('fs');
const request = require('request');
const {URL} = require('url');

const stati = [
    'unknown',
    'ongoing',
    'completed'
];
const sort = (a, b) => (
    !isNaN(a.volume)
    && !isNaN(b.volume)
    && (Number.parseInt(a.volume) - Number.parseInt(b.volume)) !== 0
)
    ? Number.parseInt(a.volume) - Number.parseInt(b.volume)
    : (
        isNaN(a.chapter)
        && !isNaN(b.chapter)
        && (Number.parseFloat(a.chapter) - Number.parseFloat(b.chapter)) !== 0
    )
        ? Number.parseFloat(a.chapter) - Number.parseFloat(b.chapter)
        : a.timestamp.valueOf() - b.timestamp.valueOf();

const doGroups = (n1,i1,n2,i2,n3,i3) => {
    let g = [];
    if (i1) g.push({group:n1,groupid:i1});
    if (i2) g.push({group:n2,groupid:i2});
    if (i3) g.push({group:n3,groupid:i3});
    return g
};

const mangarev = (k, v) => {
    switch (k) {
        case 'timestamp': return new Date(v*1e3);
        /*
        case 'genres': return v.reduce((a=[],g)=>[
            ...a,
            genres[g] || genre[0]
        ]);
        */
        case 'status':
            return stati[v] || stati[0];
        case 'chapter':
            if ('string' === typeof v)
                return v;
            const a = [];
            for (const key in v) {
                if (v.hasOwnProperty(key))
                    a.push({cid: Number.parseInt(key, 10), ...v[key]});
            }
            return a.sort(sort).map(chrewrite);
        default: return v;
    }
};

const durl = new Map;
const nchinfo = {pages:[],dataurl:null};

const chrewrite = ({
       cid, timestamp,
       chapter, volume,
       lang_code, title,
       group_name, group_id,
       group_name_2, group_id_2,
       group_name_3, group_id_3,
       chinfo = timestamp.valueOf() > Date.now() ? nchinfo : durl.get(cid) || nchinfo
   }) => ({
    cid,
    timestamp,
    chapter, ch: Number(chapter),
    volume, vol: Number(volume),
    lang: lang_code,
    ctitle: title,
    groups: doGroups(group_name,group_id,group_name_2,group_id_2,group_name_3,group_id_3),
    dataurl: chinfo.dataurl,
    npages: chinfo.pages.length,
    pages: chinfo.pages
});

module.exports = {

    getManga: (mangaId) => new Promise((resolve, reject) => {

        request.get({
            url: (process.env.BASE_URL || 'https://mangadex.org') + '/api/3640f3fb/' + mangaId,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64)'
            }
        }, (err, response, body) => {
            if (err) {
                reject(err);
            } else if (response.statusCode !== 200) {
                reject("Invalid status code "+response.statusCode);
            }
            let jsonBody = JSON.parse(body.toString(), mangarev);
            if (!jsonBody.manga) {
                reject("Failed to parse response body as JSON");
            }

            resolve(jsonBody);
        });

    }),

    getChapter: (chapterId) => new Promise((resolve, reject) => {

        let base = (process.env.BASE_URL || 'https://mangadex.org');

        request.get({
            url: base + '/chapter/' + chapterId,
        }, (err, response, body) => {
            if (err) {
                reject(err);
            } else if (response.statusCode !== 200) {
                reject("Invalid status code "+response.statusCode);
            } else if (body.toString().length < 1) {
                reject("Empty response body");
            }
            const tx = body.toString();

            try {
                let [, volume, chap, title] = tx.match(/<title>(?:Vol\. (\S+))?\s*(?:Ch\. (\S+))?\s*\((.+?)\) - MangaDex<\/title>/);
                //let [, thumb]= tx.match(/<meta property="og:image" content="(.+\/\d+\.thumb\.[^"]+)">/);
                let [, chid] = tx.match(/var chapter_id = (\d+);/);
                let [, pchid]= tx.match(/var prev_chapter_id = (\d+);/);
                let [, nchid]= tx.match(/var next_chapter_id = (\d+);/);
                let [, manid]= tx.match(/var manga_id = (\d+);/);
                let [, hash] = tx.match(/var dataurl = '([0-9a-z]{32})';/);
                let [, parr] = tx.match(/var page_array = (\[[^\]]+\]);?/);
                let [, serve]= tx.match(/var server = '([^']+)';/);
                const dataurl = new URL(serve+hash+'/', base);
                let pages = [];
                eval('pages = '+parr);
                const mdat = {dataurl, pages, mid: Number.parseInt(manid, 10), cid: Number.parseInt(chid), set: Date.now()};
                durl.set(mdat.cid, mdat);

                let chapterInfo = {
                    dataurl: dataurl,
                    pages: pages
                };

                //console.log(parr, pages);
                //console.dir(chapterInfo, {depth:Infinity});
                //process.exit();

                resolve(chapterInfo);
            } catch (err) {
                reject("Failed parsing chapterInfo of chapterId "+chapterId+": "+err.toString());
            }

        });

    })

};