/* jshint node: true */
'use strict';

var config = require(__dirname + '/config');

var isInteger = function(number) {
  return number === Math.round(number);
}

var invoice = function(invoice, cb) {
  var errorMessages = [];
  // Expiration
  if (invoice.expiration !== undefined) {
    if (typeof invoice.expiration === 'number') {
      if (Number(invoice.expiration) < new Date().getTime()) {
        errorMessages.push('expiration already expired');
      }
    }
    else {
      errorMessages.push('expiration must be a number');
    }
  }
  // Line Items
  if(invoice.line_items && invoice.line_items.length > 0) {
    invoice.line_items.forEach(function(item) {
      if (!item.amount || !item.quantity || !item.description) {
        errorMessages.push('invalid line_items: ' + JSON.stringify(item));
      }
      else {
        if (typeof item.amount !== 'number' || item.amount <= 0) {
          errorMessages.push('line_item amount must be > 0: ' + JSON.stringify(item));
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
          errorMessages.push('line_item quantity must be > 0: ' + JSON.stringify(item));
        }
        if (typeof item.description !== 'string') {
          errorMessages.push('line_item description must be a string:' + JSON.stringify(item));
        }
      }
    });
  }
  else {
    errorMessages.push('line_items must contain at least one entry');
  }
  // Currency
  if (typeof invoice.currency !== 'string') {
    errorMessages.push('missing currency');
  }
  if (!(invoice.currency === "USD" || invoice.currency === "BTC")) {
    errorMessages.push('currency must be BTC or USD');
  }

  // Minimum Confirmations
  if (typeof invoice.min_confirmations !== 'number' || !isInteger(invoice.min_confirmations)) {
    errorMessages.push('min_confirmations must be an integer >= 0');
  }
  else {
    if (invoice.min_confirmations < 0) {
      errorMessages.push('min_confirmations must be an integer >= 0');
    }
    else if (invoice.min_confirmations > 24) {
      errorMessages.push('min_confirmations must be an integer < 24');
    }
  }
  // Title
  if (invoice.title && typeof invoice.title !== 'string' ) {
    errorMessages.push('title must be a string');
  }
  // Text
  if (invoice.text && typeof invoice.text !== 'string') {
    errorMessages.push('text must be a string');
  }
  // Webhooks
  if (invoice.webhooks) {
    if (typeof invoice.webhooks.token !== 'string' ) {
      errorMessages.push('if you use webhooks, it must contain a string token');
    }
    // TODO: Validate the individual webhooks
  }

  if (errorMessages.length > 0) {
    cb(new Error(errorMessages));
  }
  else {
    cb();
  }
};

var invoiceExpired = function(invoice) {
  var curTime = new Date().getTime();
  if (invoice && invoice.expiration) {
    return Number(invoice.expiration) < curTime;
  }
  else {
    return false;
  }
};

var block = function(block) {
  return Number(block.confirmations) !== -1;
};

var paymentChanged = function(payment, transaction, newStatus) {
  var oldAmount = payment.amount_paid;
  var newAmount = transaction.amount;
  var oldTxId = payment.txid;
  var newTxId = transaction.txid;
  var oldBlockHash = payment.blockhash;
  var newBlockHash = transaction.blockhash ? transaction.blockhash : null;
  var oldPaidTime = payment.paid_timestamp;
  var newPaidTime = transaction.time * 1000;
  var oldStatus = payment.status;
  var oldDoubleSpentHist = payment.double_spent_history ? payment.double_spent_history : [];
  var newDoubleSpentHist = transaction.walletconflicts ? transaction.walletconflicts : [];
  var oldPaymentWatched = payment.watched;
  var newPaymentWatched = transaction.confirmations === -1 ? false : transaction.confirmations < config.trackPaymentUntilConf;
  return oldAmount !== newAmount || oldTxId !== newTxId ||
    oldBlockHash !== newBlockHash || oldPaidTime !== newPaidTime ||
    oldStatus !== newStatus || oldPaymentWatched !== newPaymentWatched || oldDoubleSpentHist.length !== newDoubleSpentHist.length;
};

module.exports = {
  invoice: invoice,
  invoiceExpired: invoiceExpired,
  block: block,
  paymentChanged: paymentChanged,
  isInteger: isInteger
};
