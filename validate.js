module.exports = {
  invoice: function(invoice) {
    if (!invoice.currency || !invoice.min_confirmations || !invoice.line_items ||
         invoice.line_items.length < 1 || !invoice.balance_due ||
         invoice.expiration < new Date().getTime()) {
       return null;
    }
    else {
      return invoice;
    }
  },
  invoiceExpired: function(invoice) {
    if (invoice.expiration) {
      return invoice.expiration < new Date().getTime();
    }
    else {
      return false;
    }
  },
  objectID: function(str) {
    str = str + '';
    var len = str.length, valid = false;
    if (len === 12 || len === 24) {
      valid = /^[0-9a-fA-F]+$/.test(str);
    }
    return valid;
  }
};