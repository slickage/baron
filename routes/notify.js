var invoiceUtil = require('../invoiceutil');
var bitcoinUtil = require('../bitcoinutil');

var notify = function(app) {

  app.post('/notify', function(req, res) {

    var txId = req.body.txId;
    bitcoinUtil.getTransaction(txId, function(err, transaction) {
      if (err) { return console.log(err); }
      console.log(transaction);
      invoiceUtil.updatePayment(transaction, function(err, results) {
        if (err) {
          res.send(500);
          res.end();
        }
      });
      res.end();
    });
  });

  app.post('/blocknotify', function(req, res) {
    var blockHash = req.body.blockHash;

    bitcoinUtil.getBlock(blockHash, function(err, blockinfo) {
      if (err) { return console.log(err); }
      console.log(blockinfo);
      res.end();
    });
  });

};

module.exports = notify;