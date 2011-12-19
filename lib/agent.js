var HttpAgentBase = require('http').Agent,
    HttpsAgentBase = require('https').Agent,
    util = require('util'),
    net = require('net'),
    tls = require('tls')
;

var HttpAgent = function(options) {
    var self = this;
    self.options = options || {};
    self.requests = {};
    self.sockets = {};
    self.maxSockets = 1;
    self.on('free', function(socket, host, port) {
	var name = host + ':' + port;
	if (self.requests[name] && self.requests[name].length) {
	    self.requests[name].shift().onSocket(socket);
	} else {
	    if (self.spray_session_complete) {
		socket.destroy();
	    }
	}
    });
    self.createConnection = net.createConnection;
};

util.inherits(HttpAgent, HttpAgentBase);

var HttpsAgent = function(options) {
  var self = this;
    self.options = options || {};
    self.requests = {};
    self.sockets = {};
    self.maxSockets = 1;
    self.on('free', function(socket, host, port) {
	var name = host + ':' + port;
	if (self.requests[name] && self.requests[name].length) {
	    self.requests[name].shift().onSocket(socket);
	} else {
	    if (self.spray_session_complete) {
		socket.destroy();
	    }
	}
    });
    self.createConnection = function(port, host, options) {
	return tls.connect(port, host, options);
    };
};

util.inherits(HttpsAgent, HttpsAgentBase);

exports.create = function(protocol) {
    if (protocol === 'https') return new HttpsAgent();
    return new HttpAgent();
};
