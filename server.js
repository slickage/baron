/* jshint node: true */
'use strict';

var db = require(__dirname + '/db');
var config = require(__dirname + '/config');
var log = require(__dirname + '/log');
var watchJob = require(__dirname + '/jobs/watchpaymentjob');
var blockJob = require(__dirname + '/jobs/lastblockjob');
var tickerJob = require(__dirname + '/jobs/tickerjob');
var webhooksJob = require(__dirname + '/jobs/webhooksjob');
var sanityCheck = require(__dirname + '/lib/sanitycheck');
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var async = require('async');

// Sanity checks prior to start
async.waterfall([
  function (cb) {
    // wait until couchdb is ready
    sanityCheck.proceedWhenCouchIsReady(cb);
  },
  function (cb) {
    // create or use baron db
    db.instantiateDb(cb);
  },
  function (cb) {
    // wait until bitcoind is ready
    sanityCheck.proceedWhenBitcoindIsReady(cb);
  },
  function (cb) {
    // create or use tickerJob db
    tickerJob.startTickerJob(cb);
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
      log.error(err, 'Baron Init Error');
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
      // Trust X-Forwarded-For
      if (config.trustProxy) {
        app.enable('trust proxy');
      }
      // Cache busting for the routes.
      app.use(function(req, res, next){
        res.set('Cache-Control', 'no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', 'Sat, 26 Jul 1997 05:00:00 GMT');
        next();
      });
      // Position Barons routes above 404 and 500
      require(__dirname + '/routes')(app);
      // Catches all routes that werent initialized in the /routes directory.
      app.use(function(req, res) {
        res.status(404);
        if (req.accepts('html')) {
          res.render('error', { appTitle: config.appTitle, errorMsg: '404, these are not the invoices you are looking for.' });
        }
        else if (req.accepts('json')) {
          res.send({ error: 'Not found' });
        }
        else {
          res.type('text').send('Not found');
        }
      });
      // Catch all for any other errors
      app.use(function(error, req, res) {
        res.status(error.status || 500);
        res.render('error', { appTitle: config.appTitle, errorMsg: error.message || 'Internal Server Error' });
      });
      blockJob.runLastBlockJob();
      watchJob.runWatchPaymentsJob();
      webhooksJob.runWebhooksJob();
      app.listen(config.port);
      log.info('CouchDB server:    http://' + config.couchdb.host + '/' + config.couchdb.name);
      log.info('Bitcoind RPC:      http://' + config.bitcoind.host + ':' + config.bitcoind.port);
      log.info('Baron listening:   http://0.0.0.0:' + config.port);
    }
  }
);
