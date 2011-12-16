var Protocol = module.exports = function(stats) {
    this.stats = stats;
};

Protocol.prototype.request = function(request, callback) {
    var stats = this.stats;
    var self = this;

    var now = Date.now();
    if (stats.sec.sent >= this.config.rate) {
        stats.queued++;
        if (stats.queued > stats.max_queued) stats.max_queued = stats.queued;
        var delta = 1000 - (now - stats.sec.start);

        // Don't immediately retry. This causes CPU churn.
        if (delta < 5) delta = this.config.interval;

        return setTimeout(function() {
            stats.queued--;
            Protocol.prototype.request.call(self, request, callback);
        }, delta);
    }

    // update send stats
    stats.sent++;
    stats.sec.sent++;
    stats.min.sent++;
    stats.in_progress++;

    var start = Date.now();
    request(function(err, response) {
        stats.in_progress--;

        if (err) {
            if (err === 'timeout') {
                stats.timeouts++;
                stats.sec.timeouts++;
                stats.min.timeouts++;
            } else {
                console.error('Error '+err);
            }
            stats.errors++;
            stats.sec.errors++;
            stats.min.errors++;
            return callback(err);
        }

        var latency = Date.now() - start;

        // update latency stats
        if (latency > stats.max_latency) stats.max_latency = latency;
        if (latency < stats.min_latency) stats.min_latency = latency;
        stats.sec.total_latency += latency;
	stats.min.total_latency += latency;
        stats.total_latency += latency;

        // update receive stats
        stats.received++;
	stats.sec.received++;
        stats.min.received++;

        return callback(null, response);
    });
};