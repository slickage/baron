module.exports = {
	invoice: function(invoice) {
		if (!invoice.currency || !invoice.min_confirmations || !invoice.line_items ||
				 invoice.line_items.length < 1 || !invoice.balance_due) {
			 return null; 
		}
		else {
			return invoice;
		}
	},
	objectID: function(str) {
    str = str + '';
    var len = str.length, valid = false;
    if (len == 12 || len == 24) {
      valid = /^[0-9a-fA-F]+$/.test(str);
    }
    return valid
  }
};