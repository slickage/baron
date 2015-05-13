'use strict';

var db = require(__dirname + '/../db');
var config = require(__dirname + '/../config');
var tickerJob = require(__dirname + '/../jobs/tickerjob');

db.instantiateDb(function() {
  tickerJob.setupTickerDb(function() {});
});
