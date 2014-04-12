var config = require('./config');
var request = require('request');
var helper = require('./helper');
var BigNumber = require('bignumber.js');
var db = require('./db');

function getTransaction(payment, transactions) {
  var paymentTxId = payment.tx_id;
  var paymentAddress = payment.address;
  var paymentAmount = new BigNumber(payment.amount_paid);
  var matchingTransaction;
  console.log('starting');
  if (transactions.length === 1){
    matchingTransaction = transactions[0];
  }
  else {
    var i = 0;
    console.log(transactions.length);
    transactions.forEach(function(transaction) {
      // First match by tx, if not then by address and amount
      // If txids exist and match, then use this transaction
      if (transaction.txid && paymentTxId && transaction.txid === paymentTxId) {
        console.log('Found matching Txids');
        matchingTransaction = transaction;
      }
      else { // Match by Address and created time
        var vouts = transaction.vout;
        vouts.forEach(function(output) {
          var addresses = output.scriptPubKey.addresses;
          addresses.forEach(function(address) {
            var outputAmount = new BigNumber(output.value);
            console.log('payment address: ' + paymentAddress + ' ' + paymentAmount.valueOf());
            console.log(address + ': ' + outputAmount);
            if (address === paymentAddress && outputAmount.equals(paymentAmount)) {
              matchingTransaction = transaction;
              console.log(matchingTransaction);
            }
          });
        });
      }
    });
    console.log('Loops: ' + i);
  }
  return matchingTransaction;
}

function updateWatchedPayment(payment, minConfirmations, body) {
  var startConfs = payment.confirmations;
  var startTxId = payment.tx_id;
  if (body.txs.length > 0) { // Updating payment with tx data
    // No I shouldn't, need to handle case where watching 
    // multiple payments with the same address, there will 
    // be multiple txs in the body.
    var transactions = body.txs;
    if(transactions.length > 1) {
      var transaction = getTransaction(payment, transactions);
      var newConfirmations = transaction.confirmations;
      // txid's dont match but payment has ntx_id
      // this means txid has mutated. What to do here?
      if (transaction.txid !== payment.tx_id && payment.ntx_id) {
        payment.confirmations = newConfirmations ? newConfirmations : payment.confirmations;
        // TODO: Handle tx mutation
      }
      else if (transaction.txid === payment.tx_id) { // Transaction matches payment
        payment.confirmations = newConfirmations ? newConfirmations : payment.confirmations;
        // What about ntx_id???????? Missed Wallet Notify while offline?
      }
      else if (!payment.tx_id) { // Payment hasn't been updated before
        payment.confirmations = newConfirmations ? newConfirmations : payment.confirmations;
        payment.tx_id = transaction.txid ? transaction.txid : payment.tx_id;
      }
    }
  }
  var confsMet = Number(payment.confirmations) >= minConfirmations;
  var paymentExpiration = Number(payment.created) + config.trackPaymentForDays * 24 * 60 * 60 * 1000;
  var isExpired = paymentExpiration < new Date().getTime();

  if (isExpired && config.trackPaymentUntilConf) { // Stop tracking once confs met
    payment.watched = false;
  }
  else if (confsMet) {
    payment.status = confsMet ? helper.getPaymentStatus(payment, minConfirmations) : payment.status;
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
    paymentsArr.forEach(function(payment) {
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