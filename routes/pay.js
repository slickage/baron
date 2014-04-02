var invoiceUtil = require('../invoiceutil');
var helper = require('../helper');
var validate = require('../validate');
var db = require('../db');

var pay = function(app) {

  // Creates a new payment or redirects to existing payment
  app.post('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
      // Validate that invoice exists and is not expired
      if (err || validate.invoiceExpired(invoice)) {
        var errorMsg = err ? err.toString() : 'Error: Invoice associated with payment is expired.';
        return res.render('error', { errorMsg:errorMsg });
      }

      // If payment exists and it's not partially paid redirect to display payment view
      var activePayment = invoiceUtil.getActivePayment(paymentsArr);
      if (activePayment && activePayment.status !== 'partial') {
        return res.redirect('/pay/' + invoiceId);
      }

      // Create a new payment object for invoices without a payment or with a partial payment
      invoiceUtil.createNewPayment(invoiceId, function(err, doc) {
        if (err || !doc) {
          return res.render('error', { errorMsg: 'Error creating payment for invoice.' });
        }
        return res.redirect('/pay/' + invoiceId);
      });
    });
  });

  // Displays payment for given invoiceId
  app.get('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
      var activePayment = invoiceUtil.getActivePayment(paymentsArr); // Get active payment for invoice
      var expired =  validate.invoiceExpired(invoice);

      var errorMsg = ''; // Set error message based on point of failure
      if (expired) { errorMsg = 'Error: Invoice associated with payment is expired.'; }
      else if (!activePayment) { errorMsg = 'Error: Invoice does not has no active payments.'; }
      else if (err) { errorMsg = err.toString(); }

      // Render error view with message
      if (err || expired || !activePayment) {
        return res.render('error', { errorMsg: errorMsg });
      }

      invoiceUtil.updateSpotRate(activePayment, function(err, doc) {
        if (err || !doc) { return res.render('error', { errorMsg: 'Error: Cannot store exchange rate for payment.' }); }
      });

      // Calculate the remaining balance and render the payment view
      invoiceUtil.calculateRemainingBalance(invoice, paymentsArr, function(err, remainingBalance) {
        // Error checking
        if (err || remainingBalance <= 0) {
          errorMsg = err ? err.toString() : 'Error: Invoice is paid in full, no payments exist.';
          return res.render('error', { errorMsg: errorMsg });
        }
        var isUSD = invoice.currency.toUpperCase() === 'USD';
        res.render('pay', {
          showRefresh: isUSD, // Refresh is only needed for invoices in USD
          invoiceId: invoiceId,
          status: activePayment.status,
          address: activePayment.address,
          amount: remainingBalance,
          amountFirstFour: helper.toFourDecimals(remainingBalance),
          amountLastFour: helper.getLastFourDecimals(remainingBalance),
          qrImageUrl: '/paymentqr?address=' + activePayment.address + '&amount=' + remainingBalance
        });
      });
      
    });
  });

};

module.exports = pay;
