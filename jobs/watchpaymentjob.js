var config = require(__dirname + '/../config');
var request = require('request');
var helper = require(__dirname + '/../helper');
var db = require(__dirname + '/../db');
var _ = require('lodash');
var paymentUtil = require(__dirname + '/../paymentutil');
var invoiceWebhooks = require(__dirname + '/../invoicewebhooks');
var bitcoinUtil = require(__dirname + '/../bitcoinutil');

// TODO: This job can be removed in the future, we can calculate
// The confirmations of our watched payments based on our stored
// last known block. Remove in the future.

function updateWatchedPayment(payment, invoice, transaction) {
  var oldStatus = payment.status;
  var oldBlockHash = payment.block_hash;
  var oldDoubleSpent = payment.double_spent_history;
  var oldReorgHist = payment.reorg_history;
  if (transaction) {
    var newConfirmations = transaction.result.confirmations;
    var newBlockHash = transaction.result.blockhash ? transaction.result.blockhash : null;
    payment.block_hash = newBlockHash;
    // If transaction blockhash changed, it has reorged and reconfirmed into another block 
    if (oldBlockHash !== transaction.result.blockhash) {
      paymentUtil.processReorgedPayment(payment, transaction.result.blockhash);
    }

    // Check for double spent (replacement, mutation, etc.)
    transaction.result.walletconflicts.forEach(function(wc) {
      payment.double_spent_history = payment.double_spent_history ? payment.double_spent_history : [];
      if (!_.contains(payment.double_spent_history, wc)) {
        payment.double_spent_history.push(wc);
      }
    });

    var newStatus = helper.getPaymentStatus(payment, newConfirmations, invoice);
    payment.status = oldStatus === newStatus ? oldStatus : newStatus;
    // payments confirmations have reached 100 (Default) confs stop watching.
    var stopTracking = newConfirmations >= config.trackPaymentUntilConf || newConfirmations === -1;
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
      db.insert(payment, function(err) {
        if (!err) {
          invoiceWebhooks.determineWebhookCall(payment.invoice_id, oldStatus, newStatus);
        }
      });
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
      return err ? console.log(err) : null;
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
          bitcoinUtil.getTransaction(payment.tx_id, function (err, transaction) {
            if (err) {
              return console.log(err);
            }
            updateWatchedPayment(payment, invoice, transaction);
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
