var db;
var config;
var watchJob;
var blockJob;

var init = function(app) {
  db.instantiateDb();
  db.pushViews();
  require('./routes')(app);
  require('bitstamped');
  blockJob.runLastBlockJob();
  watchJob.runWatchPaymentsJob();
};

module.exports = function (externalConfig) {
  global.externalConfig = externalConfig;
  config = require('./config');
  db =  require('./db');
  watchJob = require('./watchpaymentjob');
  blockJob = require('./lastblockjob');
  var externalMethods = {
    init: init,
    createInvoice: db.createInvoice,
    findInvoiceAndPayments: db.findInvoiceAndPayments
  };
  return externalMethods;
};