var helper = require('./helper');

module.exports = {
  invoice: function(invoice) {
    var curTime = new Date().getTime();
    if (!invoice.currency || !invoice.min_confirmations || !invoice.line_items ||
         invoice.line_items.length < 1 || !invoice.balance_due ||
         Number(invoice.expiration) < curTime) {
       return null;
    }
    else {
      return invoice;
    }
  },
  invoiceExpired: function(invoice) {
    var curTime = new Date().getTime();
    if (invoice && invoice.expiration) {
      return Number(invoice.expiration) < curTime;
    }
    else {
      return false;
    }
  },
  block: function(block) {
    return block.confirmations ? Number(block.confirmations) !== -1 : true;
  },
  paymentChanged: function(payment, transaction, newStatus, isWalletNotify) {
    var amount = isWalletNotify ? helper.getReceiveDetail(transaction.details).amount : transaction.amount;

    var oldAmount = payment.amount_paid;
    var newAmount = amount;
    var oldTxId = payment.tx_id;
    var newTxId = transaction.txid;
    var oldNtxId = payment.ntx_id;
    var newNtxId = transaction.normtxid;
    var oldBlockHash = payment.block_hash;
    var newBlockHash = transaction.blockhash ? transaction.blockhash : null;
    var oldPaidTime = payment.paid_timestamp;
    var newPaidTime = transaction.time * 1000;
    var oldStatus = payment.status;

    return oldAmount !== newAmount || oldTxId !== newTxId || oldNtxId !== newNtxId ||
      oldBlockHash !== newBlockHash || oldPaidTime !== newPaidTime || oldStatus !== newStatus;
  }
};