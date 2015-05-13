/* jshint couch: true */
'use strict';

var rootDir = __dirname + '/../';
var log = require(rootDir + 'log');
var config = require(rootDir + 'config');
var baronDb = require(rootDir + 'db');
var request = require('request');
var async = require('async');
var nano = require('nano')(baronDb.getCouchUrl());
var ddoc = require(rootDir + 'db/ddoc-ticker');
var dbName = 'ticker_usd';
var db;

function tickerJob(cb) {
  request(config.tickerUrl, function (err, response, body) {
    if (!err && response.statusCode === 200) {
      var tickerData = JSON.parse(body);
      Object.keys(tickerData).forEach(function(key) {
        tickerData[key] = Number(tickerData[key]);
      });
      if (!tickerData.timestamp || !tickerData.vwap) {
        // TODO: print if errors are happening, but not too often
        //       perhaps e-mail admin if down continuously for an hour?
        cb();
      }
      else {
        // need only timestamp and vwap
        var tickerSave = {};
        tickerSave.type = 'ticker';
        tickerSave.timestamp = tickerData.timestamp;
        tickerSave.vwap = tickerData.vwap;
        db.insert(tickerSave, cb);
      }
    }
    else {
      // TODO: combine this error handler with the above error
      cb(err);
    }
  });
}

var getTicker = function(timestamp, cb) {
  timestamp = Number(timestamp) / 1000; // discard milliseconds
  db.view(dbName, 'tickerByTime', { limit: 1, descending: true, startkey: timestamp }, cb);
};

var setupTickerDb = function(cb) {
  nano.db.get(dbName, function(err) {
    if (!err) {
      // exists, use it
      db = nano.use(dbName);
      cb();
    }
    else {
      // does not exist, create before use
      nano.db.create(dbName, function(err) {
        if (err) {
          log.error(err, 'Error creating ticker database');
          return process.exit(1);
        }
        db = nano.use(dbName);
        db.insert(ddoc, function(err) {
          if (err) {
            log.error(err, 'Error pushing ticker design document');
            return process.exit(1);
          }
          else {
            cb();
          }
        });
      });
    }
  });
};

var startTickerJob = function(callback) {
  async.waterfall([
    function (cb) {
      setupTickerDb(cb);
    },
    function (cb) {
      // insert ticker data once during startup
      tickerJob(function() {
        // start the periodic job, don't care about callback
        setInterval(tickerJob, config.tickerJobInterval, function() {});
        log.info('Baron Init: Recording vwap from Bitstamp API every ' + (config.tickerJobInterval / 1000 / 60) + ' minutes.');
        cb();
      });
    }
  ],
  function() {
    callback();
  });
};

module.exports = {
  setupTickerDb: setupTickerDb,
  startTickerJob: startTickerJob,
  getTicker: getTicker
};