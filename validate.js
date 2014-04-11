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
    return block.isMainChain;
  }
};