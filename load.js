var EventEmitter = require('events').EventEmitter,
    util = require('util'),
    fs = require('fs'),
    Http = require('./lib/http'),
    cube = require('cube')
;

var Load = module.exports = function(options) {
    this.stats = {
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
    this.buckets = [];
    this.tid = null;
    options.time = options.time*1000;
    options.interval = options.interval || Math.floor(1000/options.rate);
    this.options = options;
    this.init_buckets();
    this.cube_client = options.enable_cube ? cube.emitter().open('127.0.0.1', 1080) : null;
    this.http = new Http(this.stats);
};

util.inherits(Load, EventEmitter);

Load.prototype.run = function(callback) {
    var options = this.options;
    var stats = this.stats;
    var self = this;
    this.http.config = options;

    var time = Date.now();
    stats.start_time = time;
    stats.one_sec_start = time;
    stats.one_min_start = time;

    this.tid = setInterval(function() {self.loop(callback);}, options.interval);
};

Load.prototype.init_buckets = function() {
    var session;
    var options = this.options;
    for (var i = 0; i < options.sessions.length; i++) {
	session = options.sessions[i];
	if (!session.weight || session.weight < 0) {
            this.buckets.push(i);
        } else {
            for (var j = 0; j < session.weight; j++) {
                this.buckets.push(i);
            }
        }
    }
};

Load.prototype.loop = function(callback) {
    var options = this.options;
    var stats = this.stats;
    var now = Date.now();
    this.reset_counters(now);
    if ((now - stats.start_time) >= options.time) {
        stats.end_time = now;
        stats.duration = (stats.end_time - stats.start_time)/1000;
        stats.avg_send_rate = stats.sent/stats.duration;
        stats.avg_receive_rate = stats.received/stats.duration;
        clearInterval(this.tid);
        callback(null, stats);
    }
    this.start_session();
};

Load.prototype.start_session = function() {
    var options = this.options;
    var stats = this.stats;
    var buckets = this.buckets;
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
};
Load.prototype.reset_counters = function(now) {
    var stats = this.stats;
    var delta = now - stats.one_sec_start;

    // reset the one second counters
    if (delta >= 1000) {
        this.emit('sec', stats);
	this.update_cube(now);
        stats.one_sec_start = now;
        stats.one_sec_sent = 0;
	stats.one_sec_received = 0;
	stats.one_sec_total_latency = 0;
    }

    // reset the one minute counters
    var minDelta = now - stats.one_min_start;
    if (minDelta > 60000) {
        stats.one_min_avg_latency = stats.one_min_total_latency/stats.one_min_received;
        this.emit('min', stats);
        stats.one_min_start = now;
        stats.one_min_total_latency = 0;
        stats.one_min_received = 0;
    }
};

Load.prototype.update_cube = function(now) {
    var stats = this.stats;
    if (this.cube_client) {
	this.cube_client.send({
	    type: 'random',
	    time: now,
	    data: {
		sent: stats.one_sec_sent,
		received: stats.one_sec_received,
		latency: stats.one_sec_total_latency/stats.one_sec_received
	    }
	});
    }
};
