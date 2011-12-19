var util = require('util'),
    Protocol = require('./protocol'),
    agent = require('./agent')
;

var Http = module.exports = function(config, stats) {
    Protocol.call(this, config, stats);
    this.http = require(config.protocol);
    this.agent = agent.create(config.protocol);
};

util.inherits(Http, Protocol);

Http.prototype.request = function(options, callback) {
    var config = this.config;

    // Node v0.6 prefers hostname to support url.parse
    options.hostname = options.hostname || config.hostname;
    // Node v0.4 requires host
    options.host = options.hostname || config.hostname;
    options.port = options.port || config.port;
    options.timeout = options.timeout || config.timeout;
    if (!(options.agent || options.agent == false)) {
	options.agent = this.agent;
    }
    var http = this.http;

    if (!(options.headers && options.headers.connection && options.headers.connection === 'keep-alive')) {
	this.agent.spray_session_complete = true;
    }

    function request(cb) {
        var tid;
        var request = http.request(options, function(response) {
            var data = '';
            response.setEncoding(options.encoding);
            response.on('data', function(chunk) {
                data += chunk;
            });
            response.on('end', function() {
                clearTimeout(tid);
                response.body = data;
                cb(null, response);
            });
        });

        tid = setTimeout(function() {
            request.abort();
            return cb('timeout');
        }, options.timeout);

        request.on('error', function(err) {
            clearTimeout(tid);
            cb(err);
        });

        var body = options.body || null,
            encoding = options.encoding || null;
        request.end(body, encoding);
    }
    return Protocol.prototype.request.call(this, request, callback);
};
