var helper = require('../helper');
var validate = require('../validate');
var db = require('../db');
var invoiceUtil = require('../invoiceutil');

var invoices = function(app) {
  
  // View Invoice by ID
  app.get('/invoices/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
      // Validate that invoice is not expired
      if (err || validate.invoiceExpired(invoice)) {
        var errorMsg = err ? err.toString() : 'Error: Invoice is expired.';
        return res.render('error', { errorMsg:errorMsg });
      }
      // Calculate Amount * Quantity for each line item's total
      invoiceUtil.calculateLineTotals(invoice);

      // Get the total paid amount for invoice
      var isUSD = invoice.currency.toUpperCase() === 'USD';
      invoice.total_paid = invoiceUtil.getTotalPaid(invoice, paymentsArr);

      // Round balance due to 2 decimals if USD. (Ex: turns $1.5 to $1.50)
      invoice.balance_due = isUSD ? helper.roundToDecimal(invoice.balance_due, 2) : invoice.balance_due;

      // Calculate the remaining balance using total paid and balance due
      invoice.remaining_balance = invoice.balance_due - invoice.total_paid;
      invoice.remaining_balance = isUSD ? helper.roundToDecimal(invoice.remaining_balance , 2) : invoice.remaining_balance;

      // Get the payment history for this invoice
      var paymentHistory = invoiceUtil.getPaymentHistory(paymentsArr); // Should the invoice display payment history
      invoice.payment_history = paymentHistory;

      // Is the invoice paid in full?
      var hasPending = false;
      paymentHistory.forEach(function(payment) {
        if (payment.status.toLowerCase() === 'pending') {
          hasPending = true;
        }
      });
      invoice.is_paid = !hasPending && invoice.remaining_balance <= 0;
      invoice.is_overpaid = !hasPending && invoice.remaining_balance < 0;
      // Show the invoice
      res.render('invoice', { invoice: invoice });
    });
  });

  // Post invoice object to /invoice to create new invoice
  app.post('/invoices', function(req, res) {
    db.createInvoice(req.body, function(err, invoice) {
      if(err) {
        res.json({ error: err });
        res.end();
      }
      else {
        res.json(invoice);
        res.end();
      }
    });
  });

};

module.exports = invoices;