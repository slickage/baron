/* jshint node: true */
'use strict';

var rootDir = __dirname + '/../';
var log = require(rootDir + 'log');
var config = require(rootDir + 'config');
var helper = require(rootDir + 'lib/helper');
var db = require(rootDir + 'db');
var paymentsLib = require(rootDir + 'lib/payments');
var bitcoinRpc = require(rootDir + 'lib/bitcoinrpc');

function updateWatchedPayment(payment, transaction) {
  var receiveDetails = helper.getReceiveDetails(transaction.details);
  var matchingDetail;
  receiveDetails.forEach(function(receiveDetail) {
    if (receiveDetail.address === payment.address) {
      matchingDetail = receiveDetail;
    }
  });
  if (matchingDetail || (!matchingDetail && (transaction.confirmations === -1))) {
    // Convert to transaction format matching listsinceblock
    transaction.address = matchingDetail ? matchingDetail.address : payment.address;
    transaction.amount = matchingDetail ? matchingDetail.amount : payment.amount_paid;
    paymentsLib.updatePaymentWithTransaction(payment, transaction, function(err) {
      if (err) {
        log.error(err, 'updatePaymentWithTransaction error');
      }
    });
  }
}

function checkPaymentExpiration(payment) {
  var curTime = new Date().getTime();
  var expirationTime = Number(payment.created) + config.spotRateValidForMinutes * 60 * 1000;
  if(payment.status === 'unpaid' && expirationTime < curTime) {
    payment.watched = false;
    db.insert(payment);
  }
}

var watchPaymentsJob = function () {
  db.getWatchedPayments(function (err, paymentsArr) {
    if (err || !paymentsArr) {
      return err ? log.error(err, 'getWatchedPayments error') : null;
    }
    // Process all watched payments
    var paidCount = 0;
    var unpaidCount = 0;
    paymentsArr.forEach(function(payment) {
      if (payment.txid) { // payment received, now watching
        paidCount++;
        bitcoinRpc.getTransaction(payment.txid, function (err, transaction) {
          if (err) {
            log.error(err, 'getTransaction error');
          }
          else {
            updateWatchedPayment(payment, transaction.result);
          }
        });
      }
      else { // payment not received
        unpaidCount++;
        checkPaymentExpiration(payment);
      }
    });
    log.debug('watchPaymentsJob total: ' + paymentsArr.length + ' paid: ' + paidCount + ' unpaid: ' + unpaidCount);
  });
};

var runWatchPaymentsJob = function () {
  setInterval(function(){
    watchPaymentsJob();
  }, config.updateWatchListInterval);
  log.info('Baron Init: watchPaymentsJob running every ' + (config.updateWatchListInterval / 1000) + ' seconds.');
};

module.exports = {
  runWatchPaymentsJob:runWatchPaymentsJob,
  watchPaymentsJob: watchPaymentsJob
};
