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
    db.findInvoice(invoiceId, function(err, invoice) {
      var expired = validate.invoiceExpired(invoice);
      if (err || !invoice || expired) {
        if (!err) {
          err = expired ? 'Error: Invoice associated with payment is expired.' : 'Cannot find invoice.';
        }
        res.render('error', { errorMsg:err });
      }
      else {
        var paymentDict = invoice.payments;
        var keys = Object.keys(paymentDict);
        var paymentAddress; // Will store the active payments address
        // Loop through payments to find the latest payment object
        keys.forEach(function(key) {
          if (paymentAddress) {
            paymentAddress = paymentDict[key].timestamp > paymentDict[paymentAddress].timestamp ? key : paymentAddress;
          }
          else {
            paymentAddress = key;
          }
        });

        // If payment exists and it's not partially paid redirect to display payment view
        if (paymentAddress && paymentDict[paymentAddress].status !== 'partial') {
          res.redirect('/pay/' + invoiceId);
        }
        // Create a new payment object for invoices without a payment or with a partial payment
        else {
          payments.getPaymentAddress(function(err, address) { // Get payment address from bitcond
            if (btcAddr.validate(address, 'testnet')) { // TODO: Remove testnet parameter for production
              // Create payment object
              var payment = {};
              payment.amount_paid = 0; // Always stored in BTC
              payment.spot_rate = null; // Exchange rate at time of payment
              payment.status = 'unpaid';
              payment.timestamp = new Date().getTime();
              payment.txId = null; // Bitcoind txid for transaction
              payment.ntxId = null; // Normalized txId

              // Add payment object to invoice
              invoice.payments[address] = payment;

              // Update the invoice object after adding payment
              db.updateInvoice(invoice, function(err, savedInvoice) {
                if (err || !savedInvoice) {
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
    db.findInvoice(invoiceId, function(err, invoice) {
      var expired = validate.invoiceExpired(invoice);
      if (err || !invoice || expired) {
        if (!err) {
          err = expired ? 'Error: Invoice associated with payment is expired.' : 'Cannot find invoice.';
        }
        res.render('error', { errorMsg:err });
      }
      else {
        var isUSD = invoice.currency.toUpperCase() === 'USD';
        var paymentDict = invoice.payments;
        var keys = Object.keys(paymentDict);
        var paymentAddress; // Will store the active payments address
        var totalPaid = 0; // Will store the sum of payments

        // Loop through payments to find the latest payment object
        // Also calculate total paid amount so we can calculate remaining balance
        keys.forEach(function(key) {
          // Grab latest paymentAddress
          if (paymentAddress) {
            paymentAddress = paymentDict[key].timestamp > paymentDict[paymentAddress].timestamp ? key : paymentAddress;
          }
          else {
            paymentAddress = key;
          }
          // Calculate totalPaid
          var paidAmount = paymentDict[key].amount_paid;
          if (paidAmount) {
            // If invoice is in USD then we must multiply the amount paid (BTC) by the spot rate (USD)
            totalPaid += isUSD ? paidAmount * paymentDict[key].spot_rate : paidAmount;
          }
        });

        // Calculate remaining balance and round if invoice is in USD
        var remainingBalance = invoice.balance_due - totalPaid;
        remainingBalance = isUSD ? helper.roundToDecimal(remainingBalance, 2) : remainingBalance;

        // Check that there is a payment for this invoice
        if (paymentAddress) {
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
                status: paymentDict[paymentAddress].status,
                address: paymentAddress,
                amount: remainingBalance,
                amountFirstFour: helper.toFourDecimals(remainingBalance),
                amountLastFour: helper.getLastFourDecimals(remainingBalance),
                qrImageUrl: '/paymentqr?address=' + paymentAddress + '&amount=' + remainingBalance
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
