var invoice = function(invoice) {
  var curTime = new Date().getTime();
  if (!invoice.currency || !invoice.min_confirmations || !invoice.line_items ||
       invoice.line_items.length < 1 || !invoice.balance_due ||
       Number(invoice.expiration) < curTime) {
     return null;
  }
  else {
    return invoice;
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
  return block.confirmations ? Number(block.confirmations) !== -1 : true;
};

var paymentChanged = function(payment, transaction, newStatus) {
  var oldAmount = payment.amount_paid;
  var newAmount = transaction.amount;
  var oldTxId = payment.tx_id;
  var newTxId = transaction.txid;
  var oldBlockHash = payment.block_hash;
  var newBlockHash = transaction.blockhash ? transaction.blockhash : null;
  var oldPaidTime = payment.paid_timestamp;
  var newPaidTime = transaction.time * 1000;
  var oldStatus = payment.status;

  return oldAmount !== newAmount || oldTxId !== newTxId ||
    oldBlockHash !== newBlockHash || oldPaidTime !== newPaidTime || oldStatus !== newStatus;
};

module.exports = {
  invoice: invoice,
  invoiceExpired: invoiceExpired,
  block: block,
  paymentChanged: paymentChanged
};