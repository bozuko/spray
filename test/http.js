var async = require('async'),
    load = require('load'),
    http = load.http,
    inspect = require('util').inspect
;

process.on('exit', function() {
    console.log(load.stats);
});

var options = {
    protocol: 'http',
    hostname: '127.0.0.1',
    port: 2701,
    rate: 100, // req/sec
    time: 300, // sec
    timeout: 20000, //ms  -- socket timeout
    max_sessions: 50,
    enable_cube:true,
    sessions: [{
        weight: 1,
        start: start_session
    }]
};

load.run(options, function(err, results) {
    if (err) return console.error("Err = "+err);
    console.log("\nresults = "+require('util').inspect(results));
});

function start_session(callback) {
    var token = Math.floor(Math.random()*100000);
    return http.request({
        headers: {'content-type': 'application/json'},
        encoding: 'utf-8',
        path: '/user/?token='+token,
        method: 'GET'
    }, function(err, res) {
        if (err) return callback(err);
        if (res.statusCode != 200) return callback(res.statusCode);
        var user = JSON.parse(res.body);
        return http.request({
            headers: {'content-type': 'application/json'},
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
