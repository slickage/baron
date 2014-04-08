var invoiceUtil = require('../invoiceutil');
var bitcoinUtil = require('../bitcoinutil');

var notify = function(app) {

  app.post('/notify', function(req, res) {
    var txId = req.body.txId;
    bitcoinUtil.getTransaction(txId, function(err, info) {
      if (err) { res.send(500); }
      var transaction = info.result;
      invoiceUtil.updatePayment(transaction, function(err, results) {
        if (err) { res.write(500); }
      });
      res.end();
    });
  });

  app.post('/blocknotify', function(req, res) {
    var blockHash = req.body.blockHash;
    bitcoinUtil.getBlock(blockHash, function(err, info) {
      if (err) { res.send(500); }
      var blockinfo = info.result;
      console.log(blockinfo);
      res.end();
    });
  });

};

module.exports = notify;