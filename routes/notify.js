var config = require(__dirname + '/../config');
var paymentUtil = require(__dirname + '/../paymentutil');
var bitcoinUtil = require(__dirname + '/../bitcoinutil');
var blockJob = require(__dirname + '/../jobs/lastblockjob');
var helper = require(__dirname + '/../helper');

var notify = function(app) {

  app.post('/notify', function(req, res) {
    var txid = req.body.txid;
    var api_key = req.body.api_key;
    if (!api_key || api_key && api_key !== config.baronAPIKey) {
      var err = new Error('Access Denied: Invalid API key.');
      console.log(req.ip + ' attempted to /notify with an invalid API key.');
      res.status(401).write(err.message);
      res.end();
    }
    else {
      bitcoinUtil.getTransaction(txid, function(err, info) {
        if (err) {
          res.send(500);
        }
        else {
          var transaction = info.result;
          var receiveDetail = helper.getReceiveDetail(transaction.details);
          if (receiveDetail) {
            transaction.address = receiveDetail.address;
            transaction.amount = receiveDetail.amount;
            paymentUtil.updatePayment(transaction, function(err) {
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

    }
  });

  app.post('/blocknotify', function(req, res) {
    var api_key = req.body.api_key;
    if (!api_key || api_key && api_key !== config.baronAPIKey) {
      var err = new Error('Access Denied: Invalid API key.');
      console.log(req.ip + ' attempted to /blocknotify with an invalid API key.');
      res.status(401).write(err.message);
      res.end();
    }
    else {
      blockJob.lastBlockJob();
      res.end();
    }
  });

};

module.exports = notify;
