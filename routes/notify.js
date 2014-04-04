var invoiceUtil = require('../invoiceutil');
var bitcoinUtil = require('../bitcoinutil');

var notify = function(app) {

  app.post('/notify', function(req, res) {
  
    var txId = req.body.txId;
    bitcoinUtil.getTransaction(txId, function(err, transaction) {
      if (err) { return console.log(err); }
      invoiceUtil.updatePayment(transaction, function(err, results) {
        if (err) {
          res.error(500);
          res.end();
        }
      });
      res.end();
    });
  });

};

module.exports = notify;