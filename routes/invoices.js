var helper = require('../helper');
var validate = require('../validate');
var db = require('../db');
var config = require('../config');
var invoiceUtil = require('../invoiceutil');
var BigNumber = require('bignumber.js');

function findInvoiceAndPaymentHistory(invoiceId, cb) {
  db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
    if (err) { return cb(err, null); }
    
    var paymentHistory = invoiceUtil.getPaymentHistory(paymentsArr);
    invoice.payment_history = paymentHistory;

    var isUSD = invoice.currency.toUpperCase() === 'USD';
    invoiceUtil.calculateLineTotals(invoice);
    invoice.total_paid = invoiceUtil.getTotalPaid(invoice, paymentsArr);
    invoice.balance_due = isUSD ? helper.roundToDecimal(invoice.balance_due, 2) : invoice.balance_due;
    invoice.remaining_balance = new BigNumber(invoice.balance_due).minus(invoice.total_paid);
    invoice.remaining_balance = invoice.remaining_balance.toFixed(Math.abs(invoice.remaining_balance.e));
    invoice.remaining_balance = isUSD ? helper.roundToDecimal(invoice.remaining_balance , 2) : invoice.remaining_balance;
    
    var invoiceExpired = validate.invoiceExpired(invoice);
    if (invoiceExpired && invoice.remaining_balance > 0) {
      var expiredErr = new Error('Error: Invoice is expired.');
      return cb(expiredErr, null);
    }
    else if (invoice.expiration && !invoiceExpired && invoice.remaining_balance > 0) {
      invoice.expiration_msg = 'Expires: ' + helper.getExpirationCountDown(invoice.expiration);
    }

    // Is the invoice paid in full?
    var hasPending = false;
    paymentHistory.forEach(function(payment) {
      payment.url = config.chainExplorerUrl + '/' + payment.tx_id; // populate chain explorer url
      if(isUSD) {
        var amountUSD = new BigNumber(payment.amount_paid).times(payment.spot_rate);
        amountUSD = helper.roundToDecimal(amountUSD, 2);
        payment.amount_usd = amountUSD;
      }
      if (payment.status.toLowerCase() === 'pending') {
        hasPending = true;
      }
    });

    invoice.is_paid = !hasPending && invoice.remaining_balance <= 0;
    invoice.is_overpaid = !hasPending && invoice.remaining_balance < 0;

    return cb(null, invoice);
  });
}

var invoices = function(app) {
  
  // View Invoice by ID
  app.get('/invoices/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    findInvoiceAndPaymentHistory(invoiceId, function(err, invoice) {
      if (err) {
        return res.render('error', { errorMsg: err.message });
      }
      else {
        return res.render('invoice', { invoice: invoice });
      }
    });
  });

  // Post invoice object to /invoice to create new invoice
  app.post('/invoices', function(req, res) {
    db.createInvoice(req.body, function(err, invoice) {
      if(err) { res.write(err.message); res.end(); }
      else { res.json(invoice); }
    });
  });

};

module.exports = invoices;