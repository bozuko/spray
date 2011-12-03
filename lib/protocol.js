var Protocol = module.exports = function(stats) {
    this.stats = stats;
};

Protocol.prototype.request = function(request, callback) {
    var stats = this.stats;
    var self = this;

    var now = Date.now();
    if (stats.one_sec_pkt_ct >= this.config.rate) {
        stats.queued++;
        if (stats.queued > stats.max_queued) stats.max_queued = stats.queued;
        var delta = 1000 - (now - stats.one_sec_start);
        //console.log("delta = "+delta);
        // Don't immediately retry. This causes CPU churn.
        if (delta < 5) delta = this.config.interval;
        //console.log("defer request: delta = "+delta);

        return setTimeout(function() {
            //console.log("issuing deferred request");
            stats.queued--;
            Protocol.prototype.request.call(self, request, callback);
        }, delta);
    }

    // update send stats
    stats.sent++;
    stats.one_sec_pkt_ct++;
    stats.in_progress++;


    var start = Date.now();
    request(function(err, response) {
        stats.in_progress--;

        if (err) {
            if (err === 'timeout') {
                stats.timeouts++;
            } else {
                console.error('Error '+err);
            }
            stats.errors++;
            return callback(err);
        }

        var latency = Date.now() - start;

        // update latency stats
        if (latency > stats.max_latency) stats.max_latency = latency;
        if (latency < stats.min_latency) stats.min_latency = latency;

        // update receive stats
        stats.received++;

        //update one minute stats
        stats.one_min_total_latency += latency;
        stats.one_min_received++;

        return callback(null, response);
    });
};