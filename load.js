var https = require('https');

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

    send_requests(options, buckets, callback);
};


function send_requests(options, buckets, callback) {
    var time = Date.now();
    var stats = {
        start_time: time,
        one_sec_start: time,
        one_sec_pkt_ct: 0,
        sent: 0,
        received: 0,
        errors: 0,
        min_latency: 1000000000000,
        max_latency: 0
    };

    var check = function() {
        var now = Date.now();
        if ((now - stats.start_time) >= options.time) {
            process.stdout.write('\n');
            return callback(null, stats);
        }
        if ((now - stats.one_sec_start) >= 1000) {
            process.stdout.write('.');
            // reset one second counters
            stats.one_sec_start = now;
            stats.one_sec_pkt_ct = 0;
        }
        if (stats.one_sec_pkt_ct < options.rate) {
            // start a new session
            var rand = Math.floor(Math.random()*100);
            var index = buckets[rand];
            var session = options.sessions[index];
            start_session(options, stats, session);
        }

        setTimeout(check, Math.floor(1000/options.rate));
    };

    check();
}

//TODO:  parse options.protocol and allow http
//
// Each session must have its own socket. Therefore we use a new agent for each session.
//
function start_session(options, stats, session) {
    var req = session.requests[0];
    var opts = {
        agent: false,
        host: options.host,
        port: options.port,
        path: req.path,
        method: req.method,
        headers: req.headers || options.headers,
        body: req.body,
        encoding: req.encoding || options.encoding,
        rate: options.rate
    };

    issue_request(opts, stats, session, 0);
}

function issue_request(options, stats, session, index, opaque) {
    var now = Date.now();
    if ((now - stats.one_sec_start) >= 1000) {
        process.stdout.write('.');
        // reset one second counters
        stats.one_sec_start = now;
        stats.one_sec_pkt_ct = 0;
    }
    if (stats.one_sec_pkt_ct >= options.rate) {
        return process.nextTick(function() { issue_request(options, stats, session, index, opaque); });
    }

    // update send stats
    stats.sent++;
    stats.one_sec_pkt_ct++;

    var start = Date.now();

    var request = https.request(options, function(response) {

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

            response.body = data;

            var req = session.requests[index];
            if (!req) return;
            req.next(response, opaque, function(err, nextReq, opaque2) {
                if (err) {
                    console.log(err);
                    stats.errors++;
                    return;
                }
                if (nextReq === 'done') return;
                nextReq.host = options.host;
                nextReq.port = options.port;
                nextReq.agent = options.agent;
                nextReq.rate = options.rate;
                nextReq.headers = nextReq.headers || options.headers;
                nextReq.encoding = nextReq.encoding || options.encoding;
                issue_request(nextReq, stats, session, index+1, opaque2);
            });
        });
    });

    request.on('error', function(err) {
        console.log("request error: "+err);
        // update error stats
        stats.errors++;
    });

    var body = options.body || null,
        encoding = options.encoding || null;
    request.end(body, encoding);
}
