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
        console.log('>>> POST ERROR: ' + err);
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
        console.log('>>> GET ERROR ' + err);
        return res.render('error', { appTitle: config.appTitle,  errorMsg: err.message });
      }
      else {
        return res.render('pay', paymentData);
      }
    });
  });

  app.get('/payment/:paymentId', function(req, res) {
    var paymentId = req.params.paymentId;
    db.findPaymentById(paymentId, function(err, payment) {
      if (err || !payment) {
        res.send(400);
        res.end();
      }
      else {
        bitcoinUtil.getBlock(payment.blockhash, function(err, block) {
          if (err) {
            console.log(err);
            res.send(500);
            res.end();
          }
          payment.confirmations = 0;
          block = block.result;
          if (!err && block && block.confirmations) {
            payment.confirmations = block.confirmations;
          }
          delete payment._id;
          delete payment._rev;
          delete payment.address;
          delete payment.amount_paid;
          delete payment.created;
          delete payment.expected_amount;
          delete payment.invoice_id;
          delete payment.paid_timestamp;
          delete payment.spot_rate;
          delete payment.type;
          delete payment.watched;
          res.json(payment);
        });
      }
    });
  });

};

module.exports = pay;
