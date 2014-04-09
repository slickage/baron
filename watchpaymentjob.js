var config = require('./config');
var request = require('request');
var helper = require('./helper');
var db = require('./db');

function updateWatchedPayment(payment, minConfirmations, body) {
  var startConfs = payment.confirmations;
  var startTxId = payment.tx_id;
  if (body.txs.length > 0) { // Updating payment with tx data
    // TODO: Should I be assuming 0?
    var transaction = body.txs[0];
    if (transaction.txid === payment.tx_id || !payment.tx_id) {
      var newConfirmations = transaction.confirmations;
      payment.confirmations = newConfirmations ? newConfirmations : payment.confirmations;
      payment.tx_id = transaction.txid ? transaction.txid : payment.tx_id;
      // What about ntx_id???????? Missed Wallet Notify while offline?
    }
  }
  var confsMet = Number(payment.confirmations) >= minConfirmations;
  var paymentExpiration = Number(payment.created) + config.trackPaymentForDays * 24 * 60 * 60 * 1000;
  var isExpired = paymentExpiration < new Date().getTime();

  if (confsMet || isExpired) { // Stop tracking once confs met
    payment.status = confsMet ? helper.getPaymentStatus(payment, minConfirmations) : payment.status;
    console.log(payment.status);
    payment.watched = false;
  }

  var endConfs = payment.confirmations;
  var endTxId = payment.tx_id;
  var stopWatching = !payment.watched;
  var paymentChanged = startConfs !== endConfs || startTxId !== endTxId;
  if (stopWatching || paymentChanged) {
    db.insert(payment);
    console.log('Updated: { ' + payment.address + '[' + payment.watched + ']: ' + payment.confirmations + ' }');
  }
}

var watchPaymentsJob = function () {
  db.getWatchedPayments(function (err, paymentsArr) {
    if (err || !paymentsArr) { console.log(err); return; }
    // Proccess all watched payments
    console.log('=========================');
    console.log('Watch Payments Job: ' + paymentsArr.length);
    console.log('=========================');
    paymentsArr.forEach(function(doc) {
      var payment = doc.value;
      // TODO: Do I need logic for expired invoices here?
      db.findInvoice(payment.invoice_id, function (err, invoice) {
        if (err) { console.log(err); return; }
        // Build insight url from config
        var insightUrl = config.insight.protocol + '://' + config.insight.host + ':' + config.insight.port;
        var requestUrl = insightUrl + '/api/txs?address=' + payment.address;
        // Ask the insight api for transaction data for this payment address
        request(requestUrl, function (error, response, body) {
          updateWatchedPayment(payment, invoice.min_confirmations, JSON.parse(body));
        });
      });
    });
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