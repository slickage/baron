var bitcoinUtil = require(__dirname + '/../bitcoinutil');
var db = require(__dirname + '/../db');
var invoiceHelper = require(__dirname + '/../invoicehelper');

var statusRoute = function(app) {
  // Get status by invoice
  app.get('/status/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
      if (err || !invoice || paymentsArr.length <= 0) {
        res.send(400);
        res.end();
      }
      else {
        var payment = invoiceHelper.getActivePayment(paymentsArr);
        bitcoinUtil.getBlock(payment.block_hash, function(err, block) {
          // TODO: err.code === 0  is ECONNREFUSED, display error to user?
          payment.confirmations = 0;
          block = block.result;
          if (!err && block && block.confirmations) {
            payment.confirmations = block.confirmations;
          }
          delete payment._id;
          delete payment._rev;
          //delete payment.address;
          delete payment.amount_paid;
          delete payment.created;
          delete payment.expected_amount;
          delete payment.invoice_id;
          delete payment.paid_timestamp;
          delete payment.spot_rate;
          delete payment.type;
          delete payment.watched;
          delete payment.tx_id;
          delete payment.block_hash;
          res.json(payment);
        });
      }
    });
  });
};

module.exports = statusRoute;
