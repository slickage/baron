var config = require(__dirname + '/../config');
var paymentUtil = require(__dirname + '/../paymentutil');
var bitcoinUtil = require(__dirname + '/../bitcoinutil');
var blockJob = require(__dirname + '/../jobs/lastblockjob');
var helper = require(__dirname + '/../helper');
var _ = require('lodash');

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
          var receiveDetails = helper.getReceiveDetails(transaction.details);
          receiveDetails.forEach(function(receiveDetail) {
            if (receiveDetail) {
              var clonedTransaction = _.clone(transaction, true);
              clonedTransaction.address = receiveDetail.address;
              clonedTransaction.amount = receiveDetail.amount;
              paymentUtil.updatePayment(clonedTransaction, function(err) {
                if (err) {
                  console.log(err);
                }
              });
            }
          });
          res.end();
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
