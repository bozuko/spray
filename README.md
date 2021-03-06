## Description
Spray is a load testing tool designed for HTTP testing. It allows for easy testing of RESTful APIs and provides useful statistics. Spray integrates with [cube](https://github.com/square/cube) to provide realtime graphs of the running load test. To use multiple cores, just run the same test in parallel. Cube can handle the aggregation.

![graph](https://github.com/bozuko/spray/raw/master/img/cube.png)

## Example

```javascript
var async = require('async'),
    Load = require('spray'),
    inspect = require('util').inspect
;

process.on('exit', function() {
    console.log(load.stats);
});

var options = {
    protocol: 'https',
    hostname: 'example.com',
    port: 8000,
    rate: 100, // req/sec
    time: 300, // sec
    timeout: 20000, //ms  -- socket timeout
    max_sessions: 500,
    enable_cube:true,
    sessions: [{
        weight: 1,
        start: start_session
    }]
};

var load = new Load(options);
load.run(function(err, results) {
    if (err) return console.error("Err = "+err);
    console.log("\nresults = "+require('util').inspect(results));
});

load.on('sec', function(stats) {
    console.log("ONE SEC!");
});

load.on('min', function(stats) {
    console.log("ONE MIN");
    console.log(stats);
});

function start_session(http, callback) {
    return http.request({
        headers: {'content-type': 'application/json'},
        encoding: 'utf-8',
        path: '/api',
        method: 'GET'
    }, function(err, res) {
        if (err) return callback(err);
        if (res.statusCode != 200) return callback(res.statusCode);
        return callback(null);
    });
}
```

## API

### Constructor

```javascript
var Spray = require('spray');
var config = {
    protocol: 'https',
    hostname: 'example.com',
    port: 8000,
    rate: 100, // req/sec
    time: 300, // sec
    timeout: 20000, //ms  -- socket timeout
    max_sessions: 500,
    enable_cube:true,
    sessions: [{
        weight: 1,
        start: start_session // function defined elsewhere
    }]    
};
var spray = new Spray(config);
```

#### config object
   
   * **protocol**: string - 'http' || 'https'
   * **hostname**: string - The hostname used in http.request
   * **port**: number - The port used in http.request
   * **rate**: number - Requests/second
   * **time**: number - Duration of the test in seconds
   * **timeout**: number - The timeout for http requests (ms)
   * **max_sessions**: number - The maximum number of concurrent sessions to run     
   * **sessions**: [sessions]
    * **weight**: number - A weight which changes the probabilities for session selection.
    * **start**: function - ```start_session(http, callback)```. Make http requests with the ```http.request``` method and call ```callback``` when the session is over.
   * **enable_cube**: boolean - Whether or not to enable cube graphing. Requires mongodb and cube. defaults to falsy.
   * **agent**: mixed - the http agent setting for ```http.request``` - Defaults to a custom agent implementation with maxSockets set to 1. Can be passed another agent or ```false``` to use no agent.


### http.request

An http object gets passed to the session ``start`` function. This function keeps stats on all requests and should be used to send all requests. The options are the same as the  http.request function provided by node. The only difference is the agent option described in the **Sessions** section below. 

```javascript
function start_session(http, callback) {
    return http.request({
        headers: {
            'content-type': 'application/json',
	    'connection': 'keep-alive'  // use the same socket for the next request
        },
        encoding: 'utf-8',
        path: '/api',
        method: 'GET'
    }, function(err, res) {
        if (err) return callback(err);
        if (res.statusCode != 200) return callback(res.statusCode);
        var user = JSON.parse(res.body);
	return http.request({
	    headers: {
		'content-type': 'application/json' 
		// no 'connection': 'keep-alive' header closes the socket as this is the last req in this session
	    },
	    encoding: 'utf-8',
	    path: user.links.checkin+'/?token='+token,
	    method: 'POST',
	    body: JSON.stringify({
		ll: [42.3, -71.8]
	    })
	}, function(err, res) {
	    if (err) return callback(err);
	    if (res.statusCode != 200) return callback(res.statusCode);
	    return callback(null);
        });
    });
}
```
                            
## Sessions
In order to simulate real clients we want each client to use the same socket for each request in the same session if the 'connection' header is set to 'keep-alive'. A custom [agent](https://github.com/bozuko/spray/blob/master/lib/agent.js) is used to facilitate this, and the default is to use that agent. A different agent can be used by passing it in the agent parameter of the Spray constructor options. Setting agent to false uses no agent. It is recommended to use the custom agent if keep-alive is used by clients of your API.

## Install

    npm install spray

If you would like live charts with cube, you must install [cube](https://github.com/square/cube/wiki) and [MongoDb](http://www.mongodb.org/display/DOCS/Quickstart)

## Cube properties

**Event Type**: 'random'

This event type is used because it allows us to use cube's default collections.
 
**Properties**: 

Spray reports to cube every second. The properties below are totals for that second, except for latency, which is the average latency of all packets during that second.
 
  * sent
  * received
  * latency
  * timeouts
  * errors
                                                     
Example Cube Query

    median(random(latency))
    
## License

### The MIT License (MIT)

Copyright (c) 2011 Bozuko, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.