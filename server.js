var config = require(__dirname + '/config');
var watchJob = require(__dirname + '/jobs/watchpaymentjob');
var blockJob = require(__dirname + '/jobs/lastblockjob');
var webhooksJob = require(__dirname + '/jobs/webhooksjob');
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var bitstamped = require(__dirname + '/bitstamped');
var sanityCheck = require(__dirname + '/sanitycheck');
var async = require('async');

// Sanity checks prior to start
async.waterfall([
  function (cb) {
    // wait until bitcoind is ready
    // abort if error
    sanityCheck.proceedWhenBitcoindIsReady(cb);
  },
  function (cb) {
    // create baron db
    // abort if unsafe couchdb UUID algorithm or error
    require(__dirname + '/db').instantiateDb(cb);
  },
  ], function (err) {
    if (err) {
      console.log('Sanity Check Error: ' + require('util').inspect(err));
      process.exit(1);
    }
    else {
      // Start Baron
      var app = express();
      app.set('view engine', 'ejs');
      app.set('views', __dirname + '/views');
      app.use(bodyParser());
      app.use(express.static(path.join(__dirname, 'public')));
      require(__dirname + '/routes')(app);
      bitstamped.init(config.couchdb.url);
      blockJob.runLastBlockJob();
      watchJob.runWatchPaymentsJob();
      webhooksJob.runWebhooksJob();
      app.listen(config.port);
      console.log('CouchDB server:    ' + config.couchdb.url + '/' + config.couchdb.name);
      console.log('Bitcoind RPC:      ' + config.bitcoind.host + ':' + config.bitcoind.port);
      console.log('Baron listening:   http://0.0.0.0:' + config.port);
    }
  }
);
