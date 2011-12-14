var async = require('async'),
    Load = require('spray'),
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

var load = new Load(options);
load.run(function(err, results) {
    if (err) return console.error("Err = "+err);
    console.log("\nresults = "+require('util').inspect(results));
});

load.on('sec', function(stats) {
    console.log("ONE SEC!");
});

load.on('min', function(stats) {
    console.log("ONE MIN!");
    console.log(stats);
});


function start_session(callback) {
    var token = Math.floor(Math.random()*100000);
    var http = load.http;
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
