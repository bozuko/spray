var util = require('util'),
    Protocol = require('./protocol')
;

var Http = module.exports = function(stats) {
    Protocol.call(this, stats);
};

util.inherits(Http, Protocol);

Http.prototype.request = function(options, callback) {
    var config = this.config;
    var http = config.protocol === 'http' ? require('http') : require('https');

    // Node v0.6 prefers hostname to support url.parse
    options.hostname = options.hostname || config.hostname;
    // Node v0.4 requires host
    options.host = options.hostname || config.hostname;
    options.port = options.port || config.port;
    options.timeout = options.timeout || config.timeout;

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
