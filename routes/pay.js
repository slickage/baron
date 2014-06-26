var bitcoinUtil = require(__dirname + '/../bitcoinutil');
var config = require(__dirname + '/../config');
var db = require(__dirname + '/../db');
var payRouteUtil = require(__dirname + '/utils/pay');

var pay = function(app) {

  // Creates a new payment or redirects to existing payment
  app.post('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    payRouteUtil.findOrCreatePayment(invoiceId, function (err) {
      if (err) {
        console.log('>>> POST ERROR: ' + JSON.stringify(err));
        return res.render('error', { appTitle: config.appTitle, errorMsg: err.message });
      }
      else {
        return res.redirect('/pay/' + invoiceId);
      }
    });
  });

  // Displays payment for given invoiceId
  app.get('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    payRouteUtil.createPaymentDataForView(invoiceId, function(err, paymentData) {
      if (err) {
        console.log('>>> GET ERROR ' + JSON.stringify(err));
        return res.render('error', { appTitle: config.appTitle,  errorMsg: err.message });
      }
      else {
        return res.render('pay', paymentData);
      }
    });
  });

};

module.exports = pay;
