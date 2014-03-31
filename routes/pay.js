var payments = require('../payments');
var helper = require('../helper');
var validate = require('../validate');
var db = require('../db');
var bitstamped = require('bitstamped');
var btcAddr = require('bitcoin-address');

var pay = function(app) {

  // Creates a new payment or redirects to existing payment
  app.post('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    db.findInvoice(invoiceId, function(err, doc) {
      var invoice;
      var paymentsArr = [];
      doc.rows.forEach(function (row) {
        if (row.value.type === 'invoice') {
          invoice = row.value;
        }
        else if (row.value.type === 'payment') {
          paymentsArr.push(row.value);
        }
      });

      var expired = validate.invoiceExpired(invoice);
      if (err || !invoice || expired) {
        if (!err) {
          err = expired ? 'Error: Invoice associated with payment is expired.' : 'Cannot find invoice.';
        }
        res.render('error', { errorMsg:err });
      }
      else {
        var activePayment; // Will store the active payments address
        // Loop through payments to find the latest payment object
        paymentsArr.forEach(function(payment) {
          if (activePayment) {
            activePayment = payment.created > activePayment.created ? payment : activePayment;
          }
          else {
            activePayment = payment;
          }
        });
        // If payment exists and it's not partially paid redirect to display payment view
        if (activePayment && activePayment.status !== 'partial') {
          res.redirect('/pay/' + invoiceId);
        }
        // Create a new payment object for invoices without a payment or with a partial payment
        else {
          payments.getPaymentAddress(function(err, address) { // Get payment address from bitcond
            console.log(address);
            if (btcAddr.validate(address, 'testnet')) { // TODO: Remove testnet parameter for production
              // Create payment object
              var payment = {};
              payment.invoiceId = invoiceId;
              payment.address = address;
              payment.amount_paid = 0; // Always stored in BTC
              payment.spot_rate = null; // Exchange rate at time of payment
              payment.status = 'unpaid';
              payment.created = new Date().getTime();
              payment.paid_timestamp = null;
              payment.txId = null; // Bitcoind txid for transaction
              payment.ntxId = null; // Normalized txId
              payment.type = 'payment';

              // Add payment object to invoice
              db.createPayment(payment, function(err, doc) {
                if (err || !doc) {
                  res.render('error', { errorMsg: 'Error creating payment for invoice.' });
                }
                else { // Redirect to display payment view after saving invoice
                  res.redirect('/pay/' + invoiceId);
                }
              });
            }
            else { // The address from bitcoind came back invalid
              res.render('error', { errorMsg: 'Cannot generate valid payment address.' });
            }
          });
        }
      }
    });
  });

  // Displays payment for given invoiceId
  app.get('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    db.findInvoice(invoiceId, function(err, doc) {
      var invoice;
      var paymentsArr = [];
      doc.rows.forEach(function (row) {
        if (row.value.type === 'invoice') {
          invoice = row.value;
        }
        else if (row.value.type === 'payment') {
          paymentsArr.push(row.value);
        }
      });

      var expired = validate.invoiceExpired(invoice);
      if (err || !invoice || expired) {
        if (!err) {
          err = expired ? 'Error: Invoice associated with payment is expired.' : 'Cannot find invoice.';
        }
        res.render('error', { errorMsg:err });
      }
      else {
        var isUSD = invoice.currency.toUpperCase() === 'USD';
 
        var activePayment; // Will store the active payments address
        var totalPaid = 0; // Will store the sum of payments

        // Loop through payments to find the latest payment object
        // Also calculate total paid amount so we can calculate remaining balance
        paymentsArr.forEach(function(payment) {
          // Grab latest paymentAddress
          if (activePayment) {
            activePayment = payment.created > activePayment.created ? payment : activePayment;
          }
          else {
            activePayment = payment;
          }
          // Calculate totalPaid
          var paidAmount = payment.amount_paid;
          if (paidAmount) {
            // If invoice is in USD then we must multiply the amount paid (BTC) by the spot rate (USD)
            totalPaid += isUSD ? paidAmount * activePayment.spot_rate : paidAmount;
          }
        });

        // Calculate remaining balance and round if invoice is in USD
        var remainingBalance = invoice.balance_due - totalPaid;
        remainingBalance = isUSD ? helper.roundToDecimal(remainingBalance, 2) : remainingBalance;

        // Check that there is a payment for this invoice
        if (activePayment) {
          var curTime = new Date().getTime();
          bitstamped.getTicker(curTime, function(err, body) {
            if (!err) {
              if (isUSD) {
                var tickerData = body.rows[0].value;
                var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price
                invoice.balance_due = helper.roundToDecimal(remainingBalance / rate, 8);
                remainingBalance = invoice.balance_due;
              }
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
            }
            else {
              res.json({ error: err });
              res.end();
            }
          });
        }
        else { // Else error, payment object doesnt exist for invoice
          res.render('error', { errorMsg: 'Cannot find payment.' });
        }
      }
    });
  });
};

module.exports = pay;
