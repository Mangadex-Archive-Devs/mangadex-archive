const http2 = require('http2');
const {
	HTTP2_HEADER_PATH,
	HTTP2_HEADER_STATUS,
	HTTP2_HEADER_METHOD,
	HTTP2_HEADER_CONTENT_TYPE
} = http2.constants;
const manga = http2.connect('https://mangadex.org');
manga.pinging = setInterval(()=>manga.ping(), 3e4)

const onData = (data, res, rej, chunk) => {}
const _req = (data, res, rej) => {
	const _ = manga.request(data)
	_.on('response', onResponse.bind(_, data, res, rej));
};

async function onResponse(data, res, rej, heads, flags) => {
	_.on('data', onData.bind(this, data, res, rej));
	_.on('end', )
};
const request = (path) => new Promise(_req.bind(null,'string' === typeof path ? {[HTTP2_HEADER_PATH]:path,endStream:false} : path));

module.exports = {manga, request}


