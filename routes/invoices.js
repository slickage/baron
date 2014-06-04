var helper = require(__dirname + '/../helper');
var validate = require(__dirname + '/../validate');
var db = require(__dirname + '/../db');
var config = require(__dirname + '/../config');
var invoiceHelper = require(__dirname + '/../invoicehelper');
var BigNumber = require('bignumber.js');
var _ = require('lodash');

function findInvoiceAndPaymentHistory(invoiceId, cb) {
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

    paymentHistory = _.sortBy(paymentHistory, function(payment) {
      return payment.created;
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
        return res.render('error', { appTitle: config.appTitle, errorMsg: err.message });
      }
      else {
        return res.render('invoice', { appTitle: config.appTitle, invoice: invoice });
      }
    });
  });

  // Post invoice object to /invoice to create new invoice
  app.post('/invoices', function(req, res) {
    var invoice = req.body;
    if (!invoice.access_token || invoice.access_token && invoice.access_token !== config.baronAPIKey) {
      var err = new Error('Access Denied: Invalid access token.');
      console.log(req.ip + ' attempted to create an invoice with an invalid access token.');
      res.status(401).write(err.message);
      res.end();
    }
    else {
      db.createInvoice(req.body, function(err, invoiceData) {
        if(err) {
          res.status(400).write(err.message + '\n' + JSON.stringify(invoice));
          res.end();
        }
        else {
          res.json(invoiceData);
          res.end();
        }
      });
    }
  });

};

module.exports = invoices;