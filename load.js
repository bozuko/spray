var inspect = require('util').inspect,
    fs = require('fs'),
    Http = require('./lib/http'),
    cube = require('cube')
;

var stats = exports.stats = {
    start_time: 0,
    one_sec_start: 0,
    one_sec_sent: 0,
    one_sec_received: 0,
    one_sec_total_latency: 0,
    sent: 0,
    received: 0,
    in_progress: 0,
    timeouts: 0,
    errors: 0,
    sessions: 0,
    max_concurrent_sessions: 0,
    total_sessions_started: 0,
    total_sessions_completed: 0,
    total_sessions_error: 0,
    queued: 0,
    max_queued: 0,
    min_latency: 1000000000000,
    max_latency: 0,
    one_min_start: 0,
    one_min_total_latency: 0,
    one_min_received: 0,
    one_min_avg_latency: 0
};

var buckets = [];
var tid;

// Supported protocols
exports.http = new Http(stats);

var cube_client;
exports.run = function(options, callback) {
    this.http.config = options;

    if (options.enable_cube) {
	cube_client = cube.emitter().open('127.0.0.1', 1080);
    }

    if (!options.protocol) return new Error("options.protocol required");
    options.time = options.time*1000;
    options.interval = options.interval || Math.floor(1000/options.rate);

    init_buckets(options);

    var time = Date.now();
    stats.start_time = time;
    stats.one_sec_start = time;
    stats.one_min_start = time;

    tid = setInterval(function() {loop(options, callback);}, options.interval);
};

function loop(options, callback) {
    var now = Date.now();
    reset_counters(now);
    if ((now - stats.start_time) >= options.time) {
        stats.end_time = now;
        stats.duration = (stats.end_time - stats.start_time)/1000;
        stats.avg_send_rate = stats.sent/stats.duration;
        stats.avg_receive_rate = stats.received/stats.duration;
        clearInterval(tid);
        callback(null, stats);
    }
    start_session(options);
}

function init_buckets(options) {
    var session;
    for (var i = 0; i < options.sessions.length; i++) {
	session = options.sessions[i];
	if (!session.weight || session.weight < 0) {
            buckets.push(i);
        } else {
            for (var j = 0; j < session.weight; j++) {
                buckets.push(i);
            }
        }
    }
}

function start_session(options) {
    options.agent = false;

    if (!stats.queued && stats.sessions < options.max_sessions &&
        stats.one_sec_sent <= options.rate) {
            var rand = Math.floor(Math.random()*buckets.length);
            var index = buckets[rand];
            var session = options.sessions[index];
            stats.sessions++;
            if (stats.sessions > stats.max_concurrent_sessions) {
                stats.max_concurrent_sessions = stats.sessions;
            }
            stats.total_sessions_started++;
            session.start(function(err) {
                stats.sessions--;
                if (err) {
                    stats.total_sessions_error++;
                    stats.errors++;
                } else {
                    stats.total_sessions_completed++;
                }
            });
    }
}

function reset_counters(now) {
    var delta = now - stats.one_sec_start;

    // reset the one second counters
    if (delta >= 1000) {
	update_cube(now);
        stats.one_sec_start = now;
        stats.one_sec_sent = 0;
	stats.one_sec_received = 0;
	stats.one_sec_total_latency = 0;
    }

    // reset the one minute counters
    var minDelta = now - stats.one_min_start;
    if (minDelta > 60000) {
        stats.one_min_avg_latency = stats.one_min_total_latency/stats.one_min_received;
        stats.one_min_start = now;
        stats.one_min_total_latency = 0;
        stats.one_min_received = 0;
    }
}

function update_cube(now) {
    if (cube_client) {
	cube_client.send({
	    type: 'random',
	    time: now,
	    data: {
		sent: stats.one_sec_sent,
		received: stats.one_sec_received,
		latency: stats.one_sec_total_latency/stats.one_sec_received
	    }
	});
    }
}
