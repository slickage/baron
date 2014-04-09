module.exports = {
  invoice: function(invoice) {
    if (!invoice.currency || !invoice.min_confirmations || !invoice.line_items ||
         invoice.line_items.length < 1 || !invoice.balance_due ||
         Number(invoice.expiration) < new Date().getTime()) {
       return null;
    }
    else {
      return invoice;
    }
  },
  invoiceExpired: function(invoice) {
    if (invoice && invoice.expiration) {
      return Number(invoice.expiration) < new Date().getTime();
    }
    else {
      return false;
    }
  }
};