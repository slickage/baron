var helper = require('../helper');
var validate = require('../validate');
var db = require('../db');

var invoices = function(app) {

  // View Invoice by ID
  app.get('/invoices/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    if (validate.objectID(invoiceId)) { // Validate the invoice id
      db.findInvoice(invoiceId, function(err, invoice) {
        var expired = validate.invoiceExpired(invoice);
        if (err || !invoice || expired) {
          var errMsg = expired ? 'Error: Invoice associated with payment is expired.' : 'Cannot find invoice.';
          res.render('error', { errorMsg:errMsg });
        }
        else {
          var isUSD = invoice.currency.toUpperCase() === 'USD';

          // Calculate Amount * Quantity for each line item's total
          invoice.line_items.forEach(function (item){
            item.line_total = item.amount * item.quantity;
            if (isUSD) { // Round USD to two decimals
              item.amount = helper.roundToDecimal(item.amount, 2);
              item.line_total = helper.roundToDecimal(item.line_total, 2);
            }
            // If our calculated line total has more than 8 decimals round to 8
            else if (helper.decimalPlaces(item.line_total) > 8) { 
              item.line_total = helper.roundToDecimal(item.line_total, 8);
            }
          });

          var paymentDict = invoice.payments; 
          var keys = Object.keys(paymentDict); 
          var totalPaid = 0; // Will store sum of payment object's amount paid.
          var showPaymentHistory = false; // Should the invoice display payment history
          // Loop through each payment object to sum up totalPaid
          keys.forEach(function(key) {
            var paidAmount = paymentDict[key].amount_paid; 
            if (paidAmount) {
                // If invoice is in USD then we must multiply the amount paid (BTC) by the spot rate (USD)
                totalPaid += isUSD ? paidAmount * paymentDict[key].spot_rate : paidAmount;
            } 

            var status = paymentDict[key].status;
            // Only show payment history if the invoice has payment that is not in unpaid status
            showPaymentHistory = status.toLowerCase() !== 'unpaid' || showPaymentHistory;
            // Capitalizing first letter of payment status for display in invoice view
            paymentDict[key].status = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
          });

          // Calculate remaining balance using totalPaid
          var remainingBalance = invoice.balance_due - totalPaid;

          // If invoice is in USD, round to two decimals
          if (isUSD) {
            totalPaid = helper.roundToDecimal(totalPaid , 2);
            remainingBalance = helper.roundToDecimal(remainingBalance, 2);
            invoice.balance_due = helper.roundToDecimal(invoice.balance_due, 2);
          }

          // Add new variables to invoice object for display in invoice view
          invoice.total_paid = totalPaid;
          invoice.remaining_balance = remainingBalance;
          invoice.show_history = showPaymentHistory;
          res.render('invoice', { invoice: invoice });
        }
      });
    }
    else { // Invalid invoice ID was passed in
     res.render('error',  { errorMsg: 'Invalid Invoice ID.' });
    }
  });

  // Post invoice object to /invoice to create new invoice
  app.post('/invoices', function(req, res) {
    // Validate the new invoice
    var newInvoice = validate.invoice(req.body);
    if (newInvoice) {
      db.createInvoice(newInvoice, function(err, invoice) {
        if(err || !invoice) {
          res.json({ error:err });
          res.end();
        }
        else {        
          res.json(invoice);
          res.end();
        }
      });
    }
    else {
      res.json({ error:'The received invoice failed validation. Verify that ' + 
        'the invoice object being sent conforms to the specifications in the API' });
      res.end();
    }
  });
};


module.exports = invoices;