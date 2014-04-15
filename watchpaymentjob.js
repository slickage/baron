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
    console.log(transactions.length);
    transactions.forEach(function(transaction) {
      // First match by tx, if not then by address and amount
      // If txids exist and match, then use this transaction, dont have ntxid to compare
      if (transaction.txid && paymentTxId && transaction.txid === paymentTxId) {
        console.log('Found matching Txids');
        matchingTransaction = transaction;
      }
      else { // Match by Address and amount
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
  }
  return matchingTransaction;
}

function updateWatchedPayment(payment, invoice, body) {
  var newConfirmations = null;
  var oldStatus = payment.status;
  var newStatus = null;
  var oldBlockHash = payment.block_hash;
  var newBlockHash = null;
  if (body.txs.length > 0) { // Updating payment with tx data
    // No I shouldn't, need to handle case where watching 
    // multiple payments with the same address, there will 
    // be multiple txs in the body.
    console.log('Hash Transactions');
    try {
      var transactions = JSON.parse(body.txs);
      var transaction = getTransaction(payment, transactions);
      if (transaction) {
        newConfirmations = transaction.confirmations;
        newStatus = helper.getPaymentStatus(payment, newConfirmations, invoice);
        payment.status = oldStatus === newStatus ? oldStatus : newStatus;

        newBlockHash = transaction.blockhash;
        payment.block_hash = oldBlockHash === newBlockHash ? oldBlockHash : newBlockHash;
        
      }
    }
    catch (err) {
      console.log('Error parsing transactions from body');
      console.log(body);
      return console.log(err);
    }
  }

  var paymentExpiration = Number(payment.created) + config.trackPaymentForDays * 24 * 60 * 60 * 1000;
  var isExpired = paymentExpiration < new Date().getTime();
  var stopTracking = newConfirmations >= config.trackPaymentUntilConf;
  // If newConfirmations is null, there were no transactions for this payment
  if ((isExpired && !newConfirmations) || stopTracking) { // Stop tracking once confs met
    payment.watched = false;
  }

  if (!payment.watched || newStatus !== oldStatus || newBlockHash !== oldBlockHash) {
    db.insert(payment);
    console.log('Updated: { ' + payment.address + '[' + payment.watched + ']: ' + newConfirmations + ' }');
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
          console.log(payment);
          updateWatchedPayment(payment, invoice, JSON.parse(body));
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