var config = require(__dirname + '/config');

var invoice = function(invoice) {
  var curTime = new Date().getTime();
  var invalidLineItems = false;
  if(invoice.line_items && invoice.line_items.length > 0) {
    invoice.line_items.forEach(function(item) {
      invalidLineItems = !item.amount || !item.quantity || !item.description;
    });
  }
  if (!invoice.currency || !invoice.min_confirmations ||
      invalidLineItems ||  Number(invoice.expiration) < curTime) {
     return false;
  }
  else {
    return true;
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
  var oldBlockHash = payment.block_hash;
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
  paymentChanged: paymentChanged
};
