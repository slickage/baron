/* jshint node: true */
'use strict';

var rootDir = __dirname + '/../../';
var helper = require(rootDir + 'lib/helper');
var validate = require(rootDir +'lib/validate');
var db = require(rootDir + 'db');
var config = require(rootDir + 'config');
var invoicesLib = require(rootDir + 'lib/invoices');
var BigNumber = require('bignumber.js');
var _ = require('lodash');

var findInvoiceAndPaymentHistory = function(invoiceId, cb) {
  db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
    if (err) {
      return cb(err, null);
    }
    var origInvoice = _.cloneDeep(invoice);
    var paymentHistory = invoicesLib.getPaymentHistory(paymentsArr);
    invoice.payment_history = paymentHistory;

    var isUSD = invoice.currency.toUpperCase() === 'USD';
    invoicesLib.calculateLineTotals(invoice);
    invoicesLib.calculateDiscountTotals(invoice);
    invoice.amount_paid = invoicesLib.getTotalPaid(invoice, paymentsArr);
    invoice.balance_due = invoicesLib.getAmountDue(invoice.invoice_total, invoice.amount_paid, invoice.currency);
    invoice.is_expired = false;
    invoice.is_void = invoice.is_void ? invoice.is_void : false;
    invoice.expiration = invoice.expiration ? invoice.expiration : null;
    invoice.text = invoice.text ? invoice.text : null;

    var invoiceExpired = validate.invoiceExpired(invoice);
    invoice.is_expired = invoiceExpired && invoice.balance_due > 0;
    invoice.expiration_time = null;
    if (invoice.expiration && !invoiceExpired && invoice.balance_due > 0) {
      invoice.expiration_time = helper.getExpirationCountDown(invoice.expiration);
    }

    // Is the invoice paid in full?
    var hasPending = false;
    paymentHistory.forEach(function(payment) {
      if(isUSD) {
        var amountUSD = new BigNumber(payment.amount_paid).times(payment.spot_rate);
        amountUSD = helper.roundToDecimal(amountUSD, 2);
        payment.amount_usd = amountUSD;
      }
      payment.url = config.publicURL + '/redirect/txid/' + payment.txid; // populate chain explorer url
      hasPending = payment.status.toLowerCase() === 'pending';
      delete payment._id;
      delete payment._rev;
      delete payment.spot_rate;
    });

    invoice.payment_history = _.sortBy(paymentHistory, function(payment) {
      return payment.created;
    });

    invoice.is_paid = !hasPending && invoice.balance_due <= 0;
    invoice.is_overpaid = !hasPending && invoice.balance_due < 0;

    delete invoice.webhooks;
    delete invoice.metadata;
    delete invoice._rev;
    invoice.demo_mode = config.demoMode || false;
    return cb(null, invoice, origInvoice);
  });
};

module.exports = {
  findInvoiceAndPaymentHistory: findInvoiceAndPaymentHistory
};