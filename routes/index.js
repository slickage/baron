/* jshint node: true */
'use strict';

var api = require(__dirname + '/api');
var bitstampedApi = require(__dirname + '/../bitstamped').api;

module.exports = function(app) {
  require(__dirname + '/invoices')(app);
  require(__dirname + '/pay')(app);
  require(__dirname + '/paymentqr')(app);
  require(__dirname + '/notify')(app);
  require(__dirname + '/redirect')(app);
  app.use('/api', api);
  app.use('/api', bitstampedApi);
};
