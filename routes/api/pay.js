/* jshint node: true */
'use strict';

var payRouteUtil = require(__dirname + '/../utils/pay');

module.exports = function(api) {
  api.route('/pay/:invoiceId').get(function(req, res) {
    var invoiceId = req.params.invoiceId;
    payRouteUtil.createPaymentDataForView(invoiceId, function(err, paymentData) {
      if (err) {
        console.log(err.which + ' Error: ' + JSON.stringify(err));
        res.json(500, err);
      }
      else {
        res.json(paymentData);
      }
    });
  });
};