var invoiceUtil = require('../invoiceutil');
var bitcoinUtil = require('../bitcoinutil');
var blockJob = require('../lastblockjob');

var notify = function(app) {

  app.post('/notify', function(req, res) {
    var txId = req.body.txId;
    console.log('wallet notify: ' + txId);
    bitcoinUtil.getTransaction(txId, function(err, info) {
      if (err) { res.send(500); }
      var transaction = info.result;
      invoiceUtil.updatePayment(transaction, true, function(err) {
        if (err) { res.send(500); console.log(err); }
        else { res.end(); }
      });
    });
  });

  app.post('/blocknotify', function(req, res) {
    blockJob.lastBlockJob();
    res.end();
  });

};

module.exports = notify;