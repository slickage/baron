var helper = require(__dirname + '/../../helper');
var validate = require(__dirname + '/../../validate');
var db = require(__dirname + '/../../db');
var config = require(__dirname + '/../../config');
var invoiceHelper = require(__dirname + '/../../invoicehelper');
var BigNumber = require('bignumber.js');
var _ = require('lodash');

var findInvoiceAndPaymentHistory = function(invoiceId, cb) {
  db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
    if (err) {
      return cb(err, null);
    }
    
    var paymentHistory = invoiceHelper.getPaymentHistory(paymentsArr);
    invoice.payment_history = paymentHistory;

    var isUSD = invoice.currency.toUpperCase() === 'USD';
    invoiceHelper.calculateLineTotals(invoice);
    invoice.total_paid = invoiceHelper.getTotalPaid(invoice, paymentsArr);
    invoice.balance_due = isUSD ? helper.roundToDecimal(invoice.balance_due, 2) : Number(invoice.balance_due);
    invoice.remaining_balance = invoiceHelper.getAmountDue(invoice.balance_due, invoice.total_paid, invoice.currency);

    var invoiceExpired = validate.invoiceExpired(invoice);

    if (invoice.void) {
      var voidErr = new Error('Error: Invoice is void.');
      return cb(voidErr, null);
    }
    else if (invoiceExpired && invoice.remaining_balance > 0) {
      var expiredErr = new Error('Error: Invoice is expired.');
      return cb(expiredErr, null);
    }
    else if (invoice.expiration && !invoiceExpired && invoice.remaining_balance > 0) {
      invoice.expires = helper.getExpirationCountDown(invoice.expiration);
    }
    else {
      invoice.expiration = invoice.expiration ? invoice.expiration : null;
      invoice.expires = null;
    }

    // Is the invoice paid in full?
    var hasPending = false;
    paymentHistory.forEach(function(payment) {
      payment.url = config.chainExplorerUrl + '/' + payment.txid; // populate chain explorer url
      if(isUSD) {
        var amountUSD = new BigNumber(payment.amount_paid).times(payment.spot_rate);
        amountUSD = helper.roundToDecimal(amountUSD, 2);
        payment.amount_usd = amountUSD;
      }
      if (payment.status.toLowerCase() === 'pending') {
        hasPending = true;
      }
      delete payment._id;
      delete payment._rev;
      delete payment.spot_rate;
    });

    invoice.payment_history = _.sortBy(paymentHistory, function(payment) {
      return payment.created;
    });

    invoice.is_paid = !hasPending && invoice.remaining_balance <= 0;
    invoice.is_overpaid = !hasPending && invoice.remaining_balance < 0;

    delete invoice.webhooks;
    delete invoice.metadata;
    delete invoice._rev;
    return cb(null, invoice);
  });
};

module.exports = { findInvoiceAndPaymentHistory: findInvoiceAndPaymentHistory };