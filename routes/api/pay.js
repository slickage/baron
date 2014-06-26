var payRouteUtils = require(__dirname + '/../utils/pay');

module.exports = function(api) {
  api.route('/pay/:invoiceId').get(function(req, res) {
    var invoiceId = req.params.invoiceId;
    payRouteUtils.createPaymentDataForView(invoiceId, function(err, paymentData) {
      if (err) {
        res.json(err);
      }
      else {
        res.json(paymentData);
      }
    });
  });
};