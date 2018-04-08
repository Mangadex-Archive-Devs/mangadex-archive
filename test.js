const {getManga, getChapter} = require('./o7');
//getManga(47).then(d=>console.dir(d,{depth:Infinity,color:true}), console.error)
Promise.all([87127, 87128, 87130].map(v=>getChapter(v))).then(preloaded => {
	console.log(preloaded);
	getManga(15800).then(d=>console.dir(d,{depth:Infinity,color:true}), console.error)
});
