var invoiceUtil = require('../invoiceutil');
var bitcoinUtil = require('../bitcoinutil');
var job = require('../watchpaymentjob');

var notify = function(app) {

  app.post('/notify', function(req, res) {
    // var txId = req.body.txId;
    // bitcoinUtil.getTransaction(txId, function(err, info) {
    //   if (err) { res.send(500); }
    //   var transaction = info.result;
    //   invoiceUtil.updatePayment(transaction, function(err, body) {
    //     if (err) { res.send(500); console.log(err); }
    //     else { res.end(); }
    //   });
    // });
    res.end();
  });

  app.post('/blocknotify', function(req, res) {
    // var blockHash = req.body.blockHash;
    // bitcoinUtil.getBlock(blockHash, function(err, info) {
    //   if (err) { res.send(500); }
    //   else {
    //     job.watchPaymentsJob();
    //     res.end();
    //   }
    // });
    res.end();
  });

};

module.exports = notify;