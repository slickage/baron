var helper = require('../helper');
var db = require('../db');

var invoices = function(app) {

  // View Invoice by ID
  app.get('/invoices/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    if (helper.isValidObjectID(invoiceId)) {
      db.findInvoice(invoiceId, function(err, invoice) {
        if (err || !invoice) {
          res.render('error',  { errorMsg: 'Cannot find invoice.' });
        }
        else {
          var isUSD = (invoice.currency.toUpperCase() === 'USD');
          // Calculate and create Line Item Totals
          invoice.line_items.forEach(function (item){
            item.line_total = item.amount * item.quantity;
            // Round USD to two decimals
            if (isUSD) {
              item.amount = helper.roundToDecimal(item.amount, 2);
              item.line_total = helper.roundToDecimal(item.line_total, 2);
            }
          });

          // Calculate Balance Paid and Remaining
          var paymentArr = invoice.payments;
          var keys = Object.keys(paymentArr);
          var totalPaid = 0;

          // Calculate Total Paid and format status for view
          keys.forEach(function(key) {
            var paidAmount = paymentArr[key].amount_paid;
            var spotRate = paymentArr[key].spot_rate;
            if (paidAmount) {
              if(isUSD) {
                totalPaid += paidAmount * spotRate;
              }
              else {
                totalPaid += paidAmount;
              }
            } 
            var status = paymentArr[key].status;
            paymentArr[key].status = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
          });

          var remainingBalance = invoice.balance_due - totalPaid;

          // If USD Round to two decimals
          if (isUSD) {
            totalPaid = helper.roundToDecimal(totalPaid , 2);
            remainingBalance = helper.roundToDecimal(remainingBalance, 2);
            invoice.balance_due = helper.roundToDecimal(invoice.balance_due, 2);
          }
          invoice.total_paid = totalPaid;
          invoice.remaining_balance = remainingBalance;
          res.render('invoice', { invoice: invoice });
        }
      });
    }
    else {
     res.render('error',  { errorMsg: 'Invalid Invoice ID.' });
    }
  });

  // Creates new invoice
  app.post('/invoices', function(req, res) {
    var newInvoice = req.body;
    db.createInvoice(newInvoice, function(err, invoice) {
      if(err || !invoice) {
        res.write(err.message);
        res.end();
      }
      else {
        res.end();
      }
    });
  });
};

module.exports = invoices;