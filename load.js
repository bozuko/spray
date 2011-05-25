var inspect = require('util').inspect;
var fs = require('fs');

var stats = {
    start_time: 0,
    one_sec_start: 0,
    one_sec_pkt_ct: 0,
    sent: 0,
    received: 0,
    in_progress: 0,
    errors: 0,
    sessions: 0,
    total_sessions_started: 0,
    total_sessions_completed: 0,
    total_sessions_error: 0,
    queued: 0,
    min_latency: 1000000000000,
    max_latency: 0
};

var load = {
    buckets: [],
    file: '',
    stream: null,
    timer: null,
    done: false,
    http: null,
    callback: null
};

function dump_stats() {
    load.stream.write(JSON.stringify(stats) + "\n\n");
}

/**
 * Run load test
 *
 * @param {Object}     options     options for user sessions
 * @param {Function}   callback    callback for when load test ends
 *
 * @return {null}
 */
exports.run = function(options, callback) {

    var rv = init(options);
    if (rv != 'ok') return callback(rv);
    load.callback = callback;

    var check = function() {
        var now = Date.now();
        if (!load.done && (now - stats.start_time) >= options.time) {
            load.done = true;
            stats.end_time = now;
            stats.avg_send_rate = stats.sent/(stats.end_time - stats.start_time)*1000;
            return setTimeout(fini, options.wait_time);
        }
        if (!load.done) {
            start_session(options, load.buckets);
        }

        setTimeout(check, Math.floor(1000/options.rate));
    };

    check();
};

function init(options) {
    if (!options.protocol) return new Error("options.protocol required");
    load.http = options.protocol === 'http' ? require('http') : require('https');
    options.time = options.time*1000;

    var buckets = init_probabilities(options);
    if (buckets instanceof Error) return buckets;
    load.buckets = buckets;

    var time = Date.now();
    stats.start_time = time;
    stats.one_sec_start = time;

    load.file = options.file || 'load_' + time + '.out';
    load.stream = fs.createWriteStream(load.file);
    load.timer = setInterval(dump_stats, options.stats_interval || 10000);

    return 'ok';

};

function init_probabilities(options) {
    var probability = 0;
    var session;
    var buckets = new Array(100);
    for (var i = 0; i < options.sessions.length; i++) {
	session = options.sessions[i];
	if (!session.probability) return new Error("each session must have a probability");
        if (session.probability <= 0) return new Error("session probability must be greater than 0");

        var newprob = probability + session.probability;
        for (var j = probability; j < newprob && j < 100; j++) {
            buckets[j] = i;
        }

	probability += session.probability;
    }
    if (probability != 100) return new Error("session probabilities must add up to exactly 100");
    return buckets;
}

function fini() {
    var final_time = Date.now();
    if (!stats.last_received_time) {
        var received = stats.received - stats.in_progress;
        stats.avg_receive_rate = received/(final_time - stats.start_time)*1000;
    } else {
        stats.avg_receive_rate =
            stats.received/(stats.last_received_time - stats.start_time)*1000;
    }
    process.stdout.write('\n');
    clearInterval(load.timer);
    dump_stats();
    load.stream.end();
    load.stream.destroy();
    return load.callback(null, stats);
}


// Each session must have its own socket.
// Therefore we use a new agent for each session and set the maxSocket to 1
//
function start_session(options, buckets) {
    options.agent = false;

    // Only start the session if there are no queued messages, we don't have a maximum #
    // of sessions and we are under the max request rate
    //
    if (!stats.queued && stats.sessions < options.max_sessions &&
        stats.one_sec_pkt_ct <= options.rate) {
            var rand = Math.floor(Math.random()*100);
            var index = buckets[rand];
            var session = options.sessions[index];
            stats.sessions++;
            stats.total_sessions_started++;
            issue_request(options, session, 0);
    }
}

function issue_request(options, session, index) {
    if (load.done) return;

    var now = Date.now();
    var delta = now - stats.one_sec_start;
    if ((delta) >= 1000) {
        process.stdout.write('.');
        // reset one second counters
        stats.one_sec_start = now;
        stats.one_sec_pkt_ct = 0;
    }
    if (stats.one_sec_pkt_ct >= options.rate) {
        stats.queued++;
        return setTimeout(function() {
            stats.queued--;
            issue_request(options, session, index);
        }, delta);
    }

    // update send stats
    stats.sent++;
    stats.one_sec_pkt_ct++;
    stats.in_progress++;

    var start = Date.now();

    var request = load.http.request(options, function(response) {

        var data = '';
        response.setEncoding('utf8');
        response.on('data', function(chunk) {
            data += chunk;
        });
        response.on('end', function() {
            var latency = Date.now() - start;

            // update latency stats
            if (latency > stats.max_latency) stats.max_latency = latency;
            if (latency < stats.min_latency) stats.min_latency = latency;

            // update receive stats
            stats.received++;
            stats.in_progress--;

            if (stats.in_progress === 0 && load.done) {
                stats.last_received_time = Date.now();
            }

            response.body = data;

            var req = session.requests[index];
            if (!req) {
                stats.sessions--;
                stats.total_sessions_completed++;
                return;
            }

            response.opaque = options.opaque;
            req(response, function(err, newOptions) {
                if (err) {
                    stats.sessions--;
                    stats.total_sessions_error++;
                    console.log(err);
                    console.log('Error: path = '+options.path+', method = '+options.method+
                                ', opaque = '+JSON.stringify(options.opaque)+
                                'response.body = '+response.body+'\nerr = '+err);
                    stats.errors++;
                    return;
                }
                if (newOptions === 'done') {
                    stats.sessions--;
                    stats.total_sessions_completed++;
                    return;
                }
                newOptions.host = options.host;
                newOptions.port = options.port;
                newOptions.agent = options.agent;
                newOptions.rate = options.rate;
                newOptions.headers = newOptions.headers || options.headers;
                newOptions.encoding = newOptions.encoding || options.encoding;
                issue_request(newOptions, session, index+1);
            });
        });
    });

    // Only allow one socket per session
    request.agent.maxSockets = 1;

    request.on('error', function(err) {
        console.log("request error: "+err+", options = "+inspect(options));
        // update error stats
        stats.errors++;
    });

    var body = options.body || null,
        encoding = options.encoding || null;
    request.end(body, encoding);
}
