var db;
var config;

var init = function(app) {
  require('./routes')(app);
  require('bitstamped');
};

module.exports = function (externalConfig) {
  global.externalConfig = externalConfig;
  config = require('./config');
  db =  require('./db');
  var externalMethods = {
    init: init,
    createInvoice: db.createInvoice,
    findInvoiceAndPayments: db.findInvoiceAndPayments
  };
  return externalMethods;
};