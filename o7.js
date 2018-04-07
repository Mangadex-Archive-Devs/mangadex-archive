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
manga.pinging = setInterval(manga.ping.bind(manga), 3e4)
const ua = 'Mozilla/5.0 (Windows NT 6.3; WOW64)'

const onData = (data, res, rej, chunk) => {
	data._data.push(chunk)
};
const _req = (data, res, rej) => {
	data[HTTP2_HEADER_USER_AGENT] = ua;
	const _ = manga.request(data)
	_.on('response', onResponse.bind(_, data, res, rej));
};
const jsonred = ({d = new util.TextDecoder, t = ''} = {}, buf, i, {length}) => ({d, t:t+d.decode(buf,{stream:i!==length})});
// lol
const ms = 1e3;
const genres = ',4-koma,Action,Adventure,Award Winning,Comedy,Cooking,Doujinshi,Drama,Ecchi,Fantasy,Gender Bender,Harem,Historical,Horror,Josei,Martial Arts,Mecha,Medical,Music,Mystery,Oneshot,Psychological,Romance,School Life,Sci-Fi,Seinen,Shoujo,Shoujo Ai,Shounen,Shounen Ai,Slice of Life,Smut,Sports,Supernatural,Tragedy,Webtoon,Yaoi,Yuri,[no chapters],Game'.split(',').map((genre, genreid) => ({genre: genre || null, genreid}))
const stati = 'unknown,ongoing,completed'.split(',').map((stat, n)=>({'status':stat,statusid:n}));
const jsonrev = (k,v) => {
	switch (k) {
		case 'timestamp': return new Date(v*ms);
		case 'genres': return v.reduce((a=[],g) => {
			a.push(genres[g] || {genre: 'unknown', genreid: g})
			return a;
		},[]);
		case 'status': return stati[v] || {'status':'unknown',statusid:v}
		default: return v;
	};
};

async function onResponse(data, res, rej, heads, flags) => {
	let d = []
	this.on('data', d.push.bind(d));
	if (heads[HTTP2_HEADER_STATUS] !== 200) {
		
	};
	this.on('end', () => {
		const j = JSON.parse(d.reduce(jsonred, {d:new util.TextDecoder}), jsonrev);
		res(j)
	});
};
const request = (path) => new Promise(_req.bind(null,'string' === typeof path ? {[HTTP2_HEADER_PATH]:path,endStream:false} : path));
const getManga = id => request(`/api/3640f3fb/${id}`)

module.exports = {manga, request, getManga}


