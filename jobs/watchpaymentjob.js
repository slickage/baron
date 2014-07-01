/* jshint node: true */
'use strict';

var config = require(__dirname + '/../config');
var helper = require(__dirname + '/../helper');
var db = require(__dirname + '/../db');
var paymentUtil = require(__dirname + '/../paymentutil');
var bitcoinUtil = require(__dirname + '/../bitcoinutil');

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
    paymentUtil.updatePaymentWithTransaction(payment, transaction, function(err) {
      if (err) {
        console.log(err);
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
      return err ? console.log(err) : null;
    }
    // Process all watched payments
    var paidCount = 0;
    var unpaidCount = 0;
    paymentsArr.forEach(function(payment) {
      if (payment.txid) { // payment received, now watching
        paidCount++;

        bitcoinUtil.getTransaction(payment.txid, function (err, transaction) {
          if (err) {
            console.log(err);
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
    //console.log('DEBUG watchPaymentsJob: total: ' + paymentsArr.length + ' paid: ' + paidCount + ' unpaid: ' + unpaidCount);
  });
};

var runWatchPaymentsJob = function () {
  setInterval(function(){
    watchPaymentsJob();
  }, config.updateWatchListInterval);
  console.log('Baron Init: watchPaymentsJob running every ' + (config.updateWatchListInterval / 1000) + ' seconds.');
};

module.exports = {
  runWatchPaymentsJob:runWatchPaymentsJob,
  watchPaymentsJob: watchPaymentsJob
};
