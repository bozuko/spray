var EventEmitter = require('events').EventEmitter,
    util = require('util'),
    fs = require('fs'),
    Http = require('./lib/http'),
    cube = require('cube')
;

var Stats = function() {
    this.start = 0;
    this.sent = 0;
    this.received = 0;
    this.total_latency = 0;
    this.errors = 0;
    this.timeouts = 0;
};

var Load = module.exports = function(options) {
    var stats = this.stats = new Stats();
    stats.sec = new Stats();
    stats.min = new Stats();
    stats.in_progress = 0;
    stats.sessions = 0;
    stats.max_sessions = 0;
    stats.total_sessions_started = 0;
    stats.total_sessions_completed = 0;
    stats.total_sessions_error = 0;
    stats.max_queued = 0;
    stats.queued = 0;
    stats.min_latency = 1000000000000;
    stats.max_latency = 0;

    this.buckets = [];
    this.tid = null;
    options.time = options.time*1000;
    options.interval = options.interval || Math.floor(1000/options.rate);
    this.options = options;
    this.init_buckets();
    this.cube_client = options.enable_cube ? cube.emitter().open('127.0.0.1', 1080) : null;
};

util.inherits(Load, EventEmitter);

Load.prototype.run = function(callback) {
    var options = this.options;
    var self = this;
    var time = Date.now();
    self.stats.start = time;
    self.stats.sec.start = time;
    self.stats.min.start = time;
    this.tid = setInterval(function() {
        self.loop(callback);
    }, options.interval);
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
    if (((now - stats.start) >= options.time) && (stats.start != 0)) {
        stats.end = now;
        stats.duration = (stats.end - stats.start)/1000;
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
    if (!stats.queued && stats.sessions < options.max_sessions &&
        stats.sec.sent <= options.rate) {
            var rand = Math.floor(Math.random()*buckets.length);
            var index = buckets[rand];
            var session = options.sessions[index];
            stats.sessions++;
            if (stats.sessions > stats.max_sessions) {
                stats.max_sessions = stats.sessions;
            }
            stats.total_sessions_started++;
	    var http = new Http(options, stats);
            return session.start(http, function(err) {
                stats.sessions--;
                if (err) {
                    stats.total_sessions_error++;
                    stats.errors++;
                    stats.sec.errors++;
                    stats.min.errors++;
                } else {
                    stats.total_sessions_completed++;
                }
            });
    }
};

Load.prototype.reset_counters = function(now) {
    var stats = this.stats;
    var delta = now - stats.sec.start;

    // reset the one second counters
    if (delta >= 1000) {
        this.emit('sec', stats);
	this.update_cube(now);
        stats.sec.start = now;
        stats.sec.sent = 0;
	stats.sec.received = 0;
	stats.sec.total_latency = 0;
        stats.sec.errors = 0;
        stats.sec.timeouts = 0;
    }

    // reset the one minute counters
    var minDelta = now - stats.min.start;
    if (minDelta > 60000) {
        stats.min.avg_latency = stats.min.total_latency/stats.min.received;
        this.emit('min', stats);
        stats.min.start = now;
        stats.min.sent = 0;
        stats.min.received = 0;
        stats.min.total_latency = 0;
        stats.min.errors = 0;
        stats.min.timeouts = 0;
        stats.min.avg_latency = 0;
    }
};

Load.prototype.update_cube = function(now) {
    var stats = this.stats;
    if (this.cube_client) {
	this.cube_client.send({
	    type: 'random',
	    time: now,
	    data: {
		sent: stats.sec.sent,
		received: stats.sec.received,
		latency: stats.sec.total_latency/stats.sec.received,
                errors: stats.sec.errors,
                timeouts: stats.sec.timeouts
	    }
	});
    }
};
