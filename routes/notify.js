var paymentUtil = require(__dirname + '/../paymentutil');
var bitcoinUtil = require(__dirname + '/../bitcoinutil');
var blockJob = require(__dirname + '/../jobs/lastblockjob');
var helper = require(__dirname + '/../helper');

var notify = function(app) {

  app.post('/notify', function(req, res) {
    var txId = req.body.txId;
    bitcoinUtil.getTransaction(txId, function(err, info) {
      if (err) {
        res.send(500);
      }
      else {
        var transaction = info.result;
        var receiveDetail = helper.getReceiveDetail(transaction.details);
        if (receiveDetail) {
          transaction.address = receiveDetail.address;
          transaction.amount = receiveDetail.amount;
          transaction.debug = 'walletnotify';
          paymentUtil.txidQueue.push(transaction, function(err) {
            if (err) {
              res.send(500);
              console.log(err);
            }
            else {
              res.end();
            }
          });
        }
        else {
          res.end();
        }
      }
    });
  });

  app.post('/blocknotify', function(req, res) {
    blockJob.lastBlockJob();
    res.end();
  });

};

module.exports = notify;
