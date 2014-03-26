var payments = require('../payments');
var helper = require('../helper');
var validate = require('../validate');
var db = require('../db');
var btcAddr = require('bitcoin-address');

var pay = function(app) {

  // Creates a new payment or redirects to existing payment
  app.post('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    if (validate.objectID(invoiceId)) { // Validate invoice ID
      db.findInvoice(invoiceId, function(err, invoice) {
        var expired = validate.invoiceExpired(invoice);
        if (err || !invoice || expired) {
          var errMsg = expired ? 'Error: Invoice associated with payment is expired.' : 'Cannot find invoice.';
          res.render('error', { errorMsg:errMsg });
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
    }
    else { // Invalid invoice ID was input
     res.render('error',  { errorMsg: 'Invalid Invoice ID.' });
    }
  });

  // Displays payment for given invoiceId
  app.get('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    if (validate.objectID(invoiceId)) { // Validate invoice ID
      db.findInvoice(invoiceId, function(err, invoice) {
        var expired = validate.invoiceExpired(invoice);
        if (err || !invoice || expired) {
          var errMsg = expired ? 'Error: Invoice associated with payment is expired.' : 'Cannot find invoice.';
          res.render('error', { errorMsg:errMsg });
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
            if (isUSD) { // Convert balance due from USD to BTC if invoice is in USD
              helper.convertToBtc(function(err, response, body) {
                if (!err && response.statusCode === 200) {
                  var rate = Number(JSON.parse(body).vwap); // Bitcoin volume weighted average price
                  invoice.balance_due = helper.roundToDecimal(remainingBalance / rate, 8);
                  var amount = invoice.balance_due;
                  res.render('pay', {
                    showRefresh: true, // Refresh is only needed for invoices in USD
                    invoiceId: invoiceId,
                    status: paymentDict[paymentAddress].status,
                    address: paymentAddress,
                    amount: amount,
                    amountFirstFour: helper.toFourDecimals(amount),
                    amountLastFour: helper.getLastFourDecimals(amount),
                    qrImageUrl: '/paymentqr?address=' + paymentAddress + '&amount=' + amount
                  });
                }
                else { // Error converting USD to BTC
                  res.render('error', { errorMsg: 'Error: Cannot convert USD to BTC.' });
                }
              });
            }
            else { // Invoice is already in BTC, just display payment
              res.render('pay', {
                showRefresh: false, // No refresh since invoice is in BTC
                invoiceId: invoiceId,
                status: paymentDict[paymentAddress].status,
                address: paymentAddress,
                amount: remainingBalance,
                amountFirstFour: helper.toFourDecimals(remainingBalance),
                amountLastFour: helper.getLastFourDecimals(remainingBalance),
                qrImageUrl: '/paymentqr?address=' + paymentAddress + '&amount=' + remainingBalance
              });
            }
          }
          else { // Else error, payment object doesnt exist for invoice
            res.render('error', { errorMsg: 'Cannot find payment.' });
          }
        }
      });
    }
    else { // Invalid invoice ID was input
     res.render('error',  { errorMsg: 'Invalid Invoice ID.' });
    }
  });
};

module.exports = pay;
