/* jshint node: true */
'use strict';

var payRouteUtil = require(__dirname + '/../utils/pay');
var log = require(__dirname + '/../../log');

module.exports = function(api) {
  api.route('/pay/:invoiceId').get(function(req, res) {
    var invoiceId = req.params.invoiceId;
    payRouteUtil.createPaymentDataForView(invoiceId, function(err, paymentData) {
      if (err) {
        log.error(err, err.which + ' Error');
        res.json(500, err);
      }
      else {
        res.json(paymentData);
      }
    });
  });
};