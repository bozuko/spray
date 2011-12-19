var http = require('http');
http.createServer(function (req, res) {
    setTimeout(function() {
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.end(JSON.stringify({
	    links: {
		checkin: '/checkin'
	    }
	}));
    }, 30);
}).listen(2899, "127.0.0.1");

console.log('Server running at http://127.0.0.1:2701/');
