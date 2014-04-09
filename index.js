var db;
var config;
var job;

var init = function(app) {
  require('./routes')(app);
  require('bitstamped');
  job.runWatchPaymentsJob();
};

module.exports = function (externalConfig) {
  global.externalConfig = externalConfig;
  config = require('./config');
  db =  require('./db');
  job = require('./watchpaymentjob');
  var externalMethods = {
    init: init,
    createInvoice: db.createInvoice,
    findInvoiceAndPayments: db.findInvoiceAndPayments
  };
  return externalMethods;
};