var config = require('./config');
var path = require('path');
var payments = require('./payments');
var helper = require('./helper');
var db = require('./db');
var express = require('express');
var qr = require('qr-image');
var btcAddr = require('bitcoin-address');
var app = express();
app.set('view engine', 'ejs');
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

/*
  TODO List:
  - Store payment status as strings (paid, pending, unpaid, partial, overpaid, expired)
  - Payments should log the current "spot_rate" when paid (at 0 confirmations)
  - Add fudge rate for fiat balance due
  - Invoice needs expiration (optionally) (Warren)
  - Need to handle locking in Rate for 5 minutes for fiat
  - Handle balance paid for fiat 
*/

var main = function(app) {

  // Handling post from pay button then redirects to /pay
  app.post('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    if (helper.isValidObjectID(invoiceId)) {
      db.findInvoice(invoiceId, function(err, invoice) {
        if (err || !invoice) {
          res.render('error', { errorMsg: 'Invalid invoice cannot generate payment.' });
        }
        else {
          var paymentArr = invoice.payments;
          var keys = Object.keys(paymentArr);
          var paymentAddress;
          keys.forEach(function(key) {
            if (paymentAddress) {
              if (paymentArr[key].timestamp_utc > paymentArr[paymentAddress].timestamp_utc) {
                paymentAddress = key;
              }
            }
            else {
              paymentAddress = key;
            }
          });
          // If payment exists and its not underpaid redirect
          if (keys.length > 0 && paymentArr[paymentAddress].status !== 'partial') {
            res.redirect('/pay/' + invoiceId);
          }
          else { // Create a payment
            // Create payment address
            payments.getPaymentAddress(function(err, address) {
              // remove testnet parameter for production
              if (btcAddr.validate(address, 'testnet')) {

                // Create payment object
                var payment = {};
                payment.amount_paid = 0;
                payment.spot_rate = null;
                payment.status = 'unpaid';
                payment.timestamp_utc = new Date().getTime();
                payment.txId = null;
                payment.ntxId = null;

                invoice.payments[address] = payment;

                db.updateInvoice(invoice, function(err, docs) {
                  if (err || !docs) {
                    res.write('error', { errorMsg: 'Error creating payment for invoice.' });
                    res.end();
                  }
                  else {
                    res.redirect('/pay/' + invoiceId);
                  }
                });
              }
              else {
                res.render('error', { errorMsg: 'Cannot generate valid payment address.' });
              }
            });
          }
        }
      });
    }
    else {
     res.render('error',  { errorMsg: 'Invalid Invoice ID.' });
    }
  });

  // Display payment for give invoiceId
  app.get('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    if (helper.isValidObjectID(invoiceId)) {
      db.findInvoice(invoiceId, function(err, invoice) {
        if (err || !invoice) {
          res.render('error', { errorMsg: 'Cannot find invoice.' });
        }
        else {
          var isUSD = (invoice.currency.toUpperCase() === 'USD');
          var paymentArr = invoice.payments;
          var keys = Object.keys(paymentArr);
          var paymentAddress;

          // See if invoice has payments, get latest payment object
          keys.forEach(function(key) {
            if (paymentAddress) {
              if (paymentArr[key].timestamp_utc > paymentArr[paymentAddress].timestamp_utc) {
                paymentAddress = key;
              }              
            }
            else {
              paymentAddress = key;
            }
          });
        
          var paymentArr = invoice.payments;
          var keys = Object.keys(paymentArr);
          var totalPaid = 0;

          // Calculate Total Paid and format status for view
          keys.forEach(function(key) {
            var paidAmount = paymentArr[key].amount_paid;
            var spotRate = paymentArr[key].spot_rate;
            if (paidAmount) {
              if (isUSD) {
                totalPaid += paidAmount * spotRate;
              }
              else {
                totalPaid += paidAmount;
              }
            } 
          });

          totalPaid = helper.roundToDecimal(totalPaid , 2);
          var remainingBalance = invoice.balance_due - totalPaid;

          // If it does, display that payment object using paymentAddress
          if (paymentAddress) {
            // Convert btc to usd
            if (isUSD) {
              helper.convertToBtc(function(err, response, body) {
                // calculate amount
                if (!err && response.statusCode === 200) {
                  var rate = Number(JSON.parse(body).vwap);
                  // Display amount remaining
                  invoice.balance_due = helper.roundToDecimal(remainingBalance / rate, 8);
                  var amount = invoice.balance_due;
                  res.render('pay', {
                    showRefresh: true,
                    invoiceId: invoiceId,
                    status: paymentArr[paymentAddress].status,
                    address: paymentAddress,
                    amount: amount,
                    amountFirstFour: helper.toFourDecimals(amount),
                    amountLastFour: helper.getLastFourDecimals(amount),
                    qrImageUrl: '/paymentqr?address=' + paymentAddress + '&amount=' + amount
                  });
                }
                else {
                  res.render('error', { errorMsg: 'Error: Cannot convert USD to BTC.' });
                }
              });
            }
            else {
              res.render('pay', {
                showRefresh: false,
                invoiceId: invoiceId,
                status: paymentArr[paymentAddress].status,
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
    else {
     res.render('error',  { errorMsg: 'Invalid Invoice ID.' });
    }
  });

  // Generate payment QR Code
  app.get('/paymentqr', function(req, res) {
    var address = req.query.address;
    if (!address) {
      res.render('error', { errorMsg: 'Address is invalid: No address defined.' });
    }
    var amount = Number(req.query.amount) || undefined;
    var code = qr.image('bitcoin:' + address + '&amount=' + amount, { type: 'svg' });
    res.type('svg');
    code.pipe(res);
  });

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
      if(err) {
        res.write(err.message);
        res.end();
      }
      else {
        res.end();
      }
    });
  });
};

module.exports = main;

main(app);
app.listen(config.port);
console.log('HTTP Server on port: ' + config.port);
