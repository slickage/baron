var config = require(__dirname + '/config');
var watchJob = require(__dirname + '/jobs/watchpaymentjob');
var blockJob = require(__dirname + '/jobs/lastblockjob');
var webhooksJob = require(__dirname + '/jobs/webhooksjob');
var db = require(__dirname + '/db');
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
    db.instantiateDb(cb);
  },
  function (cb) {
    // Update previously watched payments before getting anything new from bitcoind
    watchJob.watchPaymentsJob();
    cb();
  },
  function (cb) {
    // Initialize lastBlockHash then use listSinceBlock to look for potential transactions during Baron downtime
    blockJob.lastBlockJob(cb);
  }
  ], function (err) {
    if (err) {
      console.log('Baron Startup Error: ' + JSON.stringify(err));
      process.exit(1);
    }
    else {
      // Start Baron
      var app = express();
      app.set('view engine', 'ejs');
      app.set('views', __dirname + '/views');
      app.use(bodyParser.json());
      app.use(bodyParser.urlencoded({ extended: true }));
      app.use(express.static(path.join(__dirname, 'public')));
      // Cache busting for the routes.
      app.use(function(req, res, next){
        res.set('Cache-Control', 'no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', 'Sat, 26 Jul 1997 05:00:00 GMT');
        next();
      });
      require(__dirname + '/routes')(app);
      bitstamped.init(db.getCouchUrl());
      // Disable lastBlockJob as a background job, using it only once during startup
      //blockJob.runLastBlockJob();
      watchJob.runWatchPaymentsJob();
      webhooksJob.runWebhooksJob();
      app.listen(config.port);
      console.log('CouchDB server:    http://' + config.couchdb.url + '/' + config.couchdb.name);
      console.log('Bitcoind RPC:      http://' + config.bitcoind.host + ':' + config.bitcoind.port);
      console.log('Baron listening:   http://0.0.0.0:' + config.port);
    }
  }
);
