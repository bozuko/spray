var inspect = require('util').inspect;

var _http;

var done = false;
var wait_time_expired = false;


/**
 * Run load test
 *
 * @param {Object}     options     options for user sessions
 * @param {Function}   callback    callback for when load test ends
 *
 * @return {null}
 */
exports.run = function(options, callback) {
    if (!options.protocol) return callback(new Error("options.protocol required"));
    _http = options.protocol === 'http' ? require('http') : require('https');

    var probability = 0;
    var session;
    var buckets = new Array(100);
    for (var i = 0; i < options.sessions.length; i++) {
	session = options.sessions[i];
	if (!session.probability) return callback(new Error("each session must have a probability"));
        if (session.probability <= 0) return callback(new Error("session probability must be greater than 0"));

        var newprob = probability + session.probability;
        for (var j = probability; j < newprob && j < 100; j++) {
            buckets[j] = i;
        }

	probability += session.probability;
    }
    if (probability != 100) return callback(new Error("session probabilities must add up to exactly 100"));
    options.time = options.time*1000;

    _run(options, buckets, callback);
};


function _run(options, buckets, callback) {
    var time = Date.now();
    var stats = {
        start_time: time,
        one_sec_start: time,
        one_sec_pkt_ct: 0,
        sent: 0,
        received: 0,
        in_progress: 0,
        errors: 0,
        min_latency: 1000000000000,
        max_latency: 0
    };

    var check = function() {
        var now = Date.now();
        if (!done && (now - stats.start_time) >= options.time) {
            done = true;
            stats.end_time = now;
            stats.avg_send_rate = stats.sent/(stats.end_time - stats.start_time)*1000;
            setTimeout(function() {
                var final_time = Date.now();
                if (!stats.last_received_time) {
                    var received = stats.received - stats.in_progress;
                    stats.avg_receive_rate = received/(final_time - stats.start_time)*1000;
                } else {
                    stats.avg_receive_rate =
                        stats.received/(stats.last_received_time - stats.start_time)*1000;
                }
                wait_time_expired = true;
                process.stdout.write('\n');
                return callback(null, stats);
            }, options.wait_time);
        }
        if ((now - stats.one_sec_start) >= 1000) {
            process.stdout.write('.');
            // reset one second counters
            stats.one_sec_start = now;
            if (!done) stats.one_sec_pkt_ct = 0;
        }
        if (!done && stats.one_sec_pkt_ct < options.rate) {
            // start a new session
            var rand = Math.floor(Math.random()*100);
            var index = buckets[rand];
            var session = options.sessions[index];
            start_session(options, stats, session);
        }

        if (!wait_time_expired) setTimeout(check, Math.floor(1000/options.rate));
    };

    check();
}

// Each session must have its own socket.
// Therefore we use a new agent for each session and set the maxSocket to 1
//
function start_session(options, stats, session) {
    options.agent = false;
    issue_request(options, stats, session, 0);
}

function issue_request(options, stats, session, index) {
    if (done) return;

    var now = Date.now();
    if ((now - stats.one_sec_start) >= 1000) {
        process.stdout.write('.');
        // reset one second counters
        stats.one_sec_start = now;
        stats.one_sec_pkt_ct = 0;
    }
    if (stats.one_sec_pkt_ct >= options.rate) {
        return process.nextTick(function() { issue_request(options, stats, session, index); });
    }

    // update send stats
    stats.sent++;
    stats.one_sec_pkt_ct++;
    stats.in_progress++;

    var start = Date.now();

    var request = _http.request(options, function(response) {

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
            if (stats.in_progress === 0 && done) {
                stats.last_received_time = Date.now();
            }

            response.body = data;

            var req = session.requests[index];
            if (!req) return;

            response.opaque = options.opaque;
            req(response, function(err, newOptions) {
                if (err) {
                    console.log(err);
                    stats.errors++;
                    return;
                }
                if (newOptions === 'done') return;

                newOptions.host = options.host;
                newOptions.port = options.port;
                newOptions.agent = options.agent;
                newOptions.rate = options.rate;
                newOptions.headers = newOptions.headers || options.headers;
                newOptions.encoding = newOptions.encoding || options.encoding;
                issue_request(newOptions, stats, session, index+1);
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
