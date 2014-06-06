var config = require(__dirname + '/../config');
var helper = require(__dirname + '/../helper');
var db = require(__dirname + '/../db');
var paymentUtil = require(__dirname + '/../paymentutil');
var bitcoinUtil = require(__dirname + '/../bitcoinutil');

// TODO: This job can be removed in the future, we can calculate
// The confirmations of our watched payments based on our stored
// last known block. Remove in the future.

function updateWatchedPayment(payment, transaction) {
  var receiveDetail = helper.getReceiveDetail(transaction.details);
  if (receiveDetail || (!receiveDetail && (transaction.confirmations === -1))) {
    transaction.address = receiveDetail ? receiveDetail.address : payment.address;
    transaction.amount = receiveDetail ? receiveDetail.amount : payment.amount_paid;
    paymentUtil.updatePaymentWithTransaction(payment, transaction, function(err) {
      if (err) {
        console.log(err);
      }
    });
  }
}

function checkPaymentExpiration(payment) {
    var curTime = new Date().getTime();
    var expirationTime = Number(payment.created) + config.paymentValidForMinutes * 60 * 1000;
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
    console.log('===========================');
    console.log('Watch Payments Job: ' + paymentsArr.length);
    console.log('===========================');
    var paidCount = 0;
    var unpaidCount = 0;
    paymentsArr.forEach(function(payment) {
      if (payment.tx_id) { // payment received, now watching
        paidCount++;

        bitcoinUtil.getTransaction(payment.tx_id, function (err, transaction) {
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
