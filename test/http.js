var Load = require('spray'),
    inspect = require('util').inspect
;

process.on('exit', function() {
    console.log(load.stats);
});

var options = {
    protocol: 'http',
    hostname: '127.0.0.1',
    port: 2899,
    rate: 500, // req/sec
    time: 60, // sec
    timeout: 20000, //ms  -- socket timeout
    max_sessions: 1000,
    enable_cube:true,
    sessions: [{
        weight: 1,
        start: start_session
    }]
};

var load = new Load(options);
load.run(function(err, results) {
    if (err) return console.error("Err = "+err);
    console.log("\nresults = "+require('util').inspect(results));
});

load.on('sec', function(stats) {
    console.log('sent '+stats.sec.sent+' packets');
    console.log('received '+stats.sec.received+' packets');
});

load.on('min', function(stats) {
    console.log(stats);
});

function start_session(http, callback) {
    var token = Math.floor(Math.random()*100000);
    return http.request({
        headers: {
            'content-type': 'application/json',
	    'connection': 'keep-alive'
        },
        encoding: 'utf-8',
        path: '/user/?token='+token,
        method: 'GET'
    }, function(err, res) {
        if (err) return callback(err);
        if (res.statusCode != 200) return callback(res.statusCode);
        var user = JSON.parse(res.body);
	return http.request({
	    headers: {
		'content-type': 'application/json'
	    },
	    encoding: 'utf-8',
	    path: user.links.checkin+'/?token='+token,
	    method: 'POST',
	    body: JSON.stringify({
		ll: [42.3, -71.8]
	    })
	}, function(err, res) {
	    if (err) return callback(err);
	    if (res.statusCode != 200) return callback(res.statusCode);
	    return callback(null);
        });
    });
}
