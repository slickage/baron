'use strict';

var rootDir = __dirname + '/../';
var log = require(rootDir + 'log');
var config = require(rootDir + 'config');
var bitcoinRpc = require(__dirname + '/bitcoinrpc');
var async = require('async');
var request = require('request');

var proceedWhenBitcoindIsReady = function(cb) {
  var waitForBitcoind = true;
  var connFailurePrint = true;
  var syncPrint = true;
  async.whilst(
    function () { return waitForBitcoind; },
    function (cb) {
      bitcoinRpc.getBlockTemplate(function(err, gbt) {
        if (err) {
          if (!gbt || err.code && err.code === -9 ) {
            // ECONNREFUSED, err === {} && !gbt
            // err.code === -9 for a split second during bitcoind startup
            if (connFailurePrint) {
              if (err && err.code) {
                log.error(err, 'getBlockTemplate error');
              }
              log.info('Baron Init: Bitcoind connection failure.  Baron will retry every 15 seconds until it appears.');
              connFailurePrint = false;
            }
            setTimeout(cb, 15000);
          }
          else if (err.code && err.code === -10) {
            // getBlockTemplate returns error code -10 while "Bitcoin is downloading blocks..."
            if (syncPrint) {
              log.info('Baron Init: Bitcoind is busy syncing blocks.  Baron will quietly check every 15 seconds until it is ready.');
              syncPrint = false;
            }
            setTimeout(cb, 15000);
          }
          else {
            // FATAL: unknown other error
            log.fatal(err, 'Baron Init: Fatal bitcoind error');
            process.exit(1);
          }
        }
        else {
          waitForBitcoind = false;
          cb();
        }
      });
    },
    function () {
      log.info('Baron Init: bitcoind is ready.');
      cb();
    }
  );
};

var proceedWhenCouchIsReady = function(cb) {
  var waitForCouch = true;
  var failurePrint = true;
  async.whilst(
    function () { return waitForCouch; },
    function (cb) {
      var url = config.couchdb.proto + '://' + config.couchdb.host + '/';
      request(url, function (err, response, body) {
        if (!err && response.statusCode === 200) {
          // Future: CouchDB 2.0 will have GET /up, 200 and {"status":"ok"}
          //         or an error-case 404 and {"status":"maintenance_mode"}
          waitForCouch = false;
          cb();
        }
        else {
          if (err && err.code) {
            log.debug(err, 'proceedWhenCouchIsReady error');
          }
          if (body && body.status) {
            log.debug({ couchBody: body }, 'CouchDB body');
          }
          if (failurePrint) {
            //  CouchDB 2.0 GET /up - maintenance mode 404 with {"status":"maintenance_mode"}
            //if (!err && body.status === 'maintenance_mode' ) {
            //  log.info('Baron Init: CouchDB is in maintenance mode.  Baron will retry every 15 seconds until it appears.');
            //}
            //else {
            // Probably ECONNREFUSED
            log.info('Baron Init: CouchDB appears to be down.  Baron will retry every 15 seconds until it appears.');
            //}
            failurePrint = false;
          }
          setTimeout(cb, 15000);
        }
      });
    },
    function () {
      log.info('Baron Init: CouchDB is ready.');
      cb();
    }
  );
};

module.exports = {
  proceedWhenBitcoindIsReady: proceedWhenBitcoindIsReady,
  proceedWhenCouchIsReady: proceedWhenCouchIsReady
};