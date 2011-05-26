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
        var delta = now - stats.one_sec_start;

        // reset the one second counters
        if (delta >= 1000) {
            process.stdout.write('.');
            //console.log("ONE SEC");
            // reset one second counters
            stats.one_sec_start = now;
            stats.one_sec_pkt_ct = 0;
        }

        // reset the one minute counters
        var minDelta = now - stats.one_min_start;
        if (minDelta > 60000) {
            stats.one_min_avg_latency = stats.one_min_total_latency/stats.one_min_received;
            stats.one_min_start = now;
            stats.one_min_total_latency = 0;
            stats.one_min_received = 0;
        }

        if (!load.done && (now - stats.start_time) >= options.time) {
            load.done = true;
            stats.end_time = now;
            stats.avg_send_rate = stats.sent/(stats.end_time - stats.start_time)*1000;
            return setTimeout(fini, options.wait_time);
        }
        if (!load.done) {
            start_session(options, load.buckets);
        }

        setTimeout(check, options.interval);
    };

    check();
};

// Each session must have its own socket.
// Therefore we use a new agent for each session and set the maxSocket to 1
//
function start_session(options, buckets) {
    options.agent = false;

    // Only start the session if there are no queued messages, we don't have a maximum #
    // of sessions and we are under the max request rate
    //
        //console.log('start_session: stats.queued = '+stats.queued+', stats.one_sec_pkt_ct = '+stats.one_sec_pkt_ct+", stats.sessions = "+stats.sessions);
    if (!stats.queued && stats.sessions < options.max_sessions &&
        stats.one_sec_pkt_ct <= options.rate) {
            //console.log('start_session');
            var rand = Math.floor(Math.random()*100);
            var index = buckets[rand];
            var session = options.sessions[index];
            stats.sessions++;
            if (stats.sessions > stats.max_concurrent_sessions) stats.max_concurrent_sessions = stats.sessions;
            stats.total_sessions_started++;
            issue_request(options, session, 0);
    } else {
        //console.log('don\'t start session');
    }
}

function issue_request(options, session, index) {
    if (load.done) return;
    //console.log("issue request");

    var now = Date.now();
    if (stats.one_sec_pkt_ct >= options.rate) {
        stats.queued++;
        if (stats.queued > stats.max_queued) stats.max_queued = stats.queued;
        var delta = 1000 - (now - stats.one_sec_start);
        //console.log("delta = "+delta);
        // Don't immediately retry. This causes CPU churn.
        if (delta < 5) delta = options.interval;
        //console.log("defer request: delta = "+delta);

        return setTimeout(function() {
            //console.log("issuing deferred request");
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

            //update one minute stats
            stats.one_min_total_latency += latency;
            stats.one_min_received++;


            if (stats.in_progress === 0 && load.done) {
                stats.last_received_time = Date.now();
            }

            response.body = data;

            var request_generator = session.request_generators[index];
            if (!request_generator) {
                end_session();
                return;
            }

            response.opaque = options.opaque;
            request_generator(response, function(err, newOptions) {
                if (err) {
                    end_session_error();
                    console.log('Error: path = '+options.path+', method = '+options.method+
                                ', opaque = '+JSON.stringify(options.opaque)+
                                'response.body = '+response.body+'\nerr = '+err);
                    return;
                }
                if (newOptions === 'done') {
                    end_session();
                    return;
                }
                newOptions.host = options.host;
                newOptions.port = options.port;
                newOptions.agent = options.agent;
                newOptions.rate = options.rate;
                newOptions.interval = options.interval;
                newOptions.headers = newOptions.headers || options.headers;
                newOptions.encoding = newOptions.encoding || options.encoding;
                issue_request(newOptions, session, index+1);
            });
        });
    });

    // Only allow one socket per session
    request.agent.maxSockets = 1;

    request.on('error', function(err) {
        //console.log("request error: "+err+", options = "+inspect(options));
        // update error stats
        stats.errors++;
    });

    var body = options.body || null,
        encoding = options.encoding || null;
    request.end(body, encoding);
}

function end_session() {
    //console.log("end session");
    stats.sessions--;
    stats.total_sessions_completed++;
}

function end_session_error() {
    //console.log("end session error");
    stats.sessions--;
    stats.total_sessions_error++;
    stats.errors++;
}

function init(options) {
    if (!options.protocol) return new Error("options.protocol required");
    load.http = options.protocol === 'http' ? require('http') : require('https');
    options.time = options.time*1000;
    options.interval = options.interval || Math.floor(1000/options.rate);

    var buckets = init_probabilities(options);
    if (buckets instanceof Error) return buckets;
    load.buckets = buckets;

    var time = Date.now();
    stats.start_time = time;
    stats.one_sec_start = time;
    stats.one_min_start = time;

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
    load.stream.destroySoon();
    return load.callback(null, stats);
}
