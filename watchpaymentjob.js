var config = require('./config');
var request = require('request');
var helper = require('./helper');
var db = require('./db');
var _ = require('lodash');
var invoiceUtil = require('./invoiceutil');

// TODO: This job can be removed in the future, we can calculate
// The confirmations of our watched payments based on our stored
// last known block. Remove in the future.

function updateWatchedPayment(payment, invoice, body) {
  var oldStatus = payment.status;
  var oldBlockHash = payment.block_hash;
  var oldDoubleSpent = payment.double_spent_history;
  var oldReorgHist = payment.reorg_history;
  var transaction;
  try {
    transaction = JSON.parse(body);
  }
  catch (err) {
    console.log('Error parsing transaction from body: ' + body);
    transaction = null;
  }
  if (transaction) {
    var reorgedHash;
    // If a transaction doesnt have blocktime but has a blockhash 
    // it's block was reorged
    if (!transaction.blocktime && transaction.blockhash) {
      reorgedHash = transaction.blockhash;
      transaction.blockhash = null;
      transaction.confirmations = -1; // setting to -1 to match txs coming from bitcoind
    }
    var newConfirmations = transaction.confirmations;
    var newBlockHash = transaction.blockhash ? transaction.blockhash : null;
    payment.block_hash = newBlockHash;
    // If our payment was in a block and tx doesnt have a blocktime now
    // that means the block was reorged. blocktime is removed when tx is orphaned
    if (reorgedHash) {
      invoiceUtil.processReorgedPayment(payment, reorgedHash);
    }

    // Check for double spends
    if (transaction.vin) {
      transaction.vin.forEach(function(input) {
        if (input.doubleSpentTxID) {
          payment.double_spent_history = payment.double_spent_history ? payment.double_spent_history : [];
          if (!_.contains(payment.double_spent_history, input.doubleSpentTxID)) {
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
    if (_.contains(payment.reorg_history, newBlockHash) && !payment.block_hash) {
      blockHashChanged = false;
    }
    var reorgHistChanged = (payment.reorg_history && oldReorgHist &&
                           payment.reorg_history.length !== oldReorgHist.length) ||
                           (payment.reorg_history && !oldReorgHist);
    var doubleSpentChanged = (payment.double_spent_history && oldDoubleSpent &&
                             payment.double_spent_history.length !== oldDoubleSpent.length) ||
                             (payment.double_spent_history && !oldDoubleSpent);
    payment.watched = !stopTracking;
    if (stopTracking || statusChanged || blockHashChanged || doubleSpentChanged || reorgHistChanged) {
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