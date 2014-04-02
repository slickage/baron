var invoiceUtil = require('../invoiceutil');
var bitcoinUtil = require('../bitcoinutil');
var async = require('async');

var notify = function(app) {

  app.post('/notify', function(req, res) {
    var txId = req.body.txId;
    bitcoinUtil.getTransaction(txId, function(err, transaction) {
      if (err) { return console.log(err); }
      var paymentDataArr = transaction.details;
      async.map(paymentDataArr, invoiceUtil.updatePayment, function(err, results) {
        if (err) { res.error(500); }
      });
      res.end();
    });
  });

};

module.exports = notify;