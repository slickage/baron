var config = require('./config');
var request = require('request');
var helper = require('./helper');
var db = require('./db');
var lodash = require('lodash');

// TODO: This job can be removed in the future, we can calculate
// The confirmations of our watched payments based on our stored
// last known block. Remove in the future.

function updateWatchedPayment(payment, invoice, body) {
  var oldStatus = payment.status;
  var oldBlockHash = payment.block_hash;
  var oldDoubleSpent = payment.double_spent_history;
  var transaction;
  try {
    transaction = JSON.parse(body);
  }
  catch (err) {
    console.log('Error parsing transaction from body: ' + body);
    transaction = null;
  }
  if (transaction) {
    var newConfirmations = transaction.confirmations;
    var newBlockHash = transaction.blockhash ? transaction.blockhash : null;
    payment.block_hash = newBlockHash;
    // Dont update block_hash for reorged payments until reconfirmed into new block
    if (payment.reorg_history && transaction.confirmations === 0) {
      payment.block_hash = null;
    }
    if (payment.reorg_history) {
      // Check for double spends
      transaction.vin.forEach(function(input) {
        if (input.doubleSpentTxID) {
          payment.double_spent_history = payment.double_spent_history ? payment.double_spent_history : [];
          if (!lodash.contains(payment.double_spent_history, input.doubleSpentTxID)) {
            payment.double_spent_history.push(input.doubleSpentTxID);
          }
        }
      });
    }
    var newStatus = helper.getPaymentStatus(payment, newConfirmations, invoice);
    payment.status = oldStatus === newStatus ? oldStatus : newStatus;
    // payments confirmations have reached 100 (Default) confs stop watching.
    var stopTracking = newConfirmations >= config.trackPaymentUntilConf;
    var statusChanged = newStatus && newStatus !== oldStatus;
    var blockHashChanged = newBlockHash && newBlockHash !== oldBlockHash;
    if (lodash.contains(payment.reorg_history, newBlockHash) && !payment.block_hash) {
      blockHashChanged = false;
    }
    var doubleSpentChanged = (payment.double_spent_history && oldDoubleSpent &&
                             payment.double_spent_history.length !== oldDoubleSpent.length) ||
                             (payment.double_spent_history && !oldDoubleSpent);
    payment.watched = !stopTracking;
    if (stopTracking || statusChanged || blockHashChanged || doubleSpentChanged) {
      db.insert(payment);
    }
  }
  else {
    var curTime = new Date().getTime();
    var expirationTime = Number(payment.created) + config.paymentValidForMinutes * 60 * 1000;
    if(payment.status === 'unpaid' && expirationTime < curTime) {
      payment.watched = false;
      db.insert(payment);
    }
  }
}

var watchPaymentsJob = function () {
  db.getWatchedPayments(function (err, paymentsArr) {
    if (err || !paymentsArr) {
      return console.log(err);
    }
    // Process all watched payments
    console.log('===========================');
    console.log('Watch Payments Job: ' + paymentsArr.length);
    console.log('===========================');
    var paidCount = 0;
    var unpaidCount = 0;
    paymentsArr.forEach(function(payment) {
      if (payment.tx_id) { // payment received, now watching
        paidCount++;
        db.findInvoice(payment.invoice_id, function (err, invoice) {
          if (err) {
            return console.log(err);
          }
          var insightUrl = config.insight.protocol + '://' + config.insight.host + ':' + config.insight.port;
          var requestUrl = insightUrl + '/api/tx/' + payment.tx_id;
          request(requestUrl, function (error, response, body) {
            updateWatchedPayment(payment, invoice, body);
          });
        });
      }
      else { // payment not received
        unpaidCount++;
        updateWatchedPayment(payment, null, null);
      }
    });
    console.log('> Watched Paid Count: ' + paidCount);
    console.log('> Watched Unpaid Count: ' + unpaidCount);
  });
};

var runWatchPaymentsJob = function () {
  setInterval(function(){
    watchPaymentsJob();
  }, config.updateWatchListInterval);
};

module.exports = {
  runWatchPaymentsJob:runWatchPaymentsJob,
  watchPaymentsJob: watchPaymentsJob
};