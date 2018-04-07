const util = require('util');
const http2 = require('http2');
const {
	HTTP2_HEADER_PATH,
	HTTP2_HEADER_STATUS,
	HTTP2_HEADER_METHOD,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_USER_AGENT
} = http2.constants;
const manga = http2.connect('https://mangadex.org');
manga.pinging = setInterval(manga.ping.bind(manga, d=>console.log('ping',d)), 3e4)
const ua = 'Mozilla/5.0 (Windows NT 6.3; WOW64)'

const _req = (data, onr, res, rej) => {
	data[HTTP2_HEADER_USER_AGENT] = ua;
	console.log(data)
	const _ = manga.request(data)
	_.on('response', onr.bind(_, data, res, rej));
};
const rtx = ({d = new util.TextDecoder, t = ''} = {}, buf, i, {length}) => ({d, t:t+d.decode(buf,{stream:i!==length})});
// lol
const ms = 1e3;
const genres = ',4-koma,Action,Adventure,Award Winning,Comedy,Cooking,Doujinshi,Drama,Ecchi,Fantasy,Gender Bender,Harem,Historical,Horror,Josei,Martial Arts,Mecha,Medical,Music,Mystery,Oneshot,Psychological,Romance,School Life,Sci-Fi,Seinen,Shoujo,Shoujo Ai,Shounen,Shounen Ai,Slice of Life,Smut,Sports,Supernatural,Tragedy,Webtoon,Yaoi,Yuri,[no chapters],Game'.split(',').map((genre, genreid) => ({genre: genre || null, genreid}))
const stati = 'unknown,ongoing,completed'.split(',').map((stat, n)=>({'status':stat,statusid:n}));
const sort = (a, b) => (
  !isNaN(a.volume) 
  && !isNaN(b.volume) 
  && (Number.parseInt(a.volume) - Number.parseInt(b.volume)) !== 0
) ? Number.parseInt(a.volume) - Number.parseInt(b.volume)
  : (
    !isNaN(a.chapter)
    && !isNaN(b.chapter)
    && (Number.parseFloat(a.chapter) - Number.parseFloat(b.chapter)) !== 0
  ) ? Number.parseFloat(a.chapter) - Number.parseFloat(b.chapter)
    : a.timestamp.valueOf() - b.timestamp.valueOf()

const doGroups = ([name,id],[name2,id2],[name3,id3]) => {
	if (!id) return [];
	if (id) return [{gname:name,gid:id}];
	if (id2) return [{gname:name,gid:id},{gname:name2,gid:id2}]
	return [{gname:name,gid:id},{gname:name2,gid:id2},{gname:name3,gid:id3}]
};

const durl = new Map
const nchinfo = {pages:[],dataurl:null}
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
	groups: doGroups([group_name,group_id],[group_name_2,group_id_2],[group_name_3,group_id_3]),
	dataurl: chinfo.dataurl,
	npages: chinfo.pages.length,
	pages: chinfo.pages
})

const jsonrev = (k,v) => {
	switch (k) {
		case 'timestamp': return new Date(v*ms);
		case 'genres': return v.reduce((a=[],g) => {
			a.push(genres[g] || {genre: 'unknown', genreid: g})
			return a;
		},[]);
		case 'status': return stati[v] || {'status':'unknown',statusid:v}
		case 'chapter': console.log(v)
			if ('string' === typeof v) return v
			console.log(v)
			let keys = Object.keys(v);
			let a = keys.reduce((A,key)=>[...A,{cid:Number.parseInt(key,10),...v[key]}],[]).sort(sort).map(chrewrite);
			return a;
		default: return v;
	};
};

async function onMangaResponse(data, res, rej, heads, flags) {
	let d = []
	this.on('data', d.push.bind(d));
	if (heads[HTTP2_HEADER_STATUS] !== 200) {
		throw heads
	};
	this.on('end', () => {
		const j = JSON.parse(d.reduce(rtx, {d:new util.TextDecoder}).t, jsonrev);
		d.length = 0
		res(j)
	});
};
async function onChapterResponse(data, res, rej, heads, flags) {
	let d = []
	this.on('data', d.push.bind(d))
	this.on('end', ()=>{
		const {t} = d.reduce(rtx, {})
		d.length = 0
		// let [, volume, chapter, title] = t.match(/<title>(?:Vol\. (\S+))?\s*(?:Ch\. (\S+))?\s*\((.+?)\) - MangaDex<\/title>/);
		// let [, thumb] = t.match(/<meta property="og:image" content="(.+\/\d+\.thumb\.[^"]+))">/);
		let [, chid] = t.match(/var chapter_id = (\d+);/);
		// let [, pchid] = t.match(/var prev_chapter_id = (\d+);/);
		// let [, nchid] = t.match(/var next_chapter_id = (\d+);/);
		let [, manga] = t.match(/var manga_id = (\d+);/);
		let [, hash] = t.match(/var dataurl = '([0-9a-z]{32})';/);
		let [, parr] = t.match(/var page_array = (\[[^\]]+\]);?/);
		let [, srv] = t.match(/var server = '([^']+)';/);
		const dataurl = srv+hash+'/'
		const pages = JSON.parse(parr.replace(/'/g,'"').replace(/,\];?$/,']'))
		durl.set(Number.parseInt(chid), {dataurl, pages, mid: Number.parseInt(manga)})
		res({cid: Number.parseInt(chid), mid: Number.parseInt(manga), dataurl, pages})
	})
};
const request = (path, onr) => new Promise(_req.bind(null,'string' === typeof path ? {[HTTP2_HEADER_PATH]:path,endStream:false} : path, onr));
const getManga = id => request(`/api/3640f3fb/${id}`, onMangaResponse)
const getChapter = id => request(`/chapter/${id}`, onChapterResponse)

module.exports = {manga, request, getManga, getChapter}


