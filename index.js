var config = require('./config');
var path = require('path');
var payments = require('./payments');
var helper = require('./helper');
var db = require('./db');
var express = require('express');
var request = require('request');
var qr = require('qr-image');
var btcAddr = require('bitcoin-address');
var app = express();
app.set('view engine', 'ejs');
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

/*
  TODO List:
  - If invoice is created in USD, we need to keep track of that USD value to 
    convert into BTC to ensure total amount is accurate.
  - Should invoice view display history of payments?
  - Confirm that /pay get route no longer requires currency. 
  - Do we still need the /pay get route? 
  - Can a GET route accept body parameters? (/pay GET)
  - Should status of payment in payment object be stored as a number or string?
  - Need to handle cases for when invoice should generate new payment
*/

var main = function(app) {

  app.get('/pay', function(req, res) {
    var amount = Number(req.query.amount);
    if (!helper.isNumber(amount)) {
      res.render('error', { errorMsg: 'Amount is invalid: Bitcoin amount entered was not a number.' });
    }

    var amountDecimals = helper.decimalPlaces(amount);
    if (amountDecimals > 8) {
      res.render('error', { errorMsg: 'Amount is invalid: Bitcoin amount must have 8 or less decimal places.' });
    }

    amount = helper.roundToDecimal(amount, 8);
    payments.getPaymentAddress(function(err, address) {
      // remove testnet parameter for production
      if (btcAddr.validate(address, 'testnet')) {
        res.render('pay', {
          address: address,
          amount: amount,
          amountFirstFour: helper.toFourDecimals(amount),
          amountLastFour: helper.getLastFourDecimals(amount),
          qrImageUrl: '/paymentqr?address=' + address + '&amount=' + amount
        });
      }
      else {
        res.render('error', { errorMsg: 'Cannot generate valid payment address.' });
      }
    });
  });

  // Handling post from pay button then redirects to /pay
  app.post('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    db.findInvoice(invoiceId, function(err, invoice) {
      if (err) {
        res.write(err.message);
        res.end();
      }
      else {
        var paymentArr = invoice.payments;
        // Only create new address if no payments exist
        // TODO: create new address if payment is partially paid
        // TODO: what other cases are there for generating new address
        if (Object.keys(paymentArr).length > 0) {
          res.redirect('/pay/' + invoiceId);
        }
        else {
          // Create payment address
          payments.getPaymentAddress(function(err, address) {
            // remove testnet parameter for production
            if (btcAddr.validate(address, 'testnet')) {

              // Create payment object
              var payment = {};
              payment.amount = '';
              payment.status = 'unpaid';
              payment.timestamp_utc = new Date().getTime();

              invoice.payments[address] = payment;

              db.updateInvoice(invoice, function(err, docs) {
                  if (err) {
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
  });

  // Display payment for give invoiceId
  app.get('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    db.findInvoice(invoiceId, function(err, invoice) {
      if (err) {
        res.render('error', { errorMsg: 'Cannot find invoice.' });
      }
      else {
        // See if invoice has payments, get latest payment object
        var paymentArr = invoice.payments;
        var keys = Object.keys(paymentArr);
        var paymentAddress;
        keys.forEach(function(key) {
          if (!paymentAddress) {
            paymentAddress = key;
          }
          else {
            if (paymentArr[key].timestamp_utc > paymentArr[paymentAddress].timestamp_utc) {
              paymentAddress = key;
            }
          }
        });
        // If it does, display that payment object using paymentAddress
        if (paymentAddress) {
          var amount = invoice.total_amount;
          res.render('pay', {
              address: paymentAddress,
              amount: amount,
              amountFirstFour: helper.toFourDecimals(amount),
              amountLastFour: helper.getLastFourDecimals(amount),
              qrImageUrl: '/paymentqr?address=' + paymentAddress + '&amount=' + amount
            });
        }
        else { // Else error, payment object doesnt exist for invoice
          res.render('error', { errorMsg: 'Cannot find payment.' });
        }
      }
    });
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
    db.findInvoice(req.params.invoiceId, function(err, invoice) {
      if (err) {
        res.render('error', err.message);
      }
      else {
        // Convert btc to usd
        if (invoice.currency.toUpperCase() === 'USD') {
          helper.convertToBtc(function(err, response, body) {
            // calculate amount
            if (!err && response.statusCode === 200) {
              var rate = Number(JSON.parse(body).vwap);
              invoice.line_items.forEach(function(item) {
                item.amount = helper.roundToDecimal(item.amount * rate, 2);
              });
              invoice.total_amount = helper.roundToDecimal(invoice.total_amount * rate, 2);
              res.render('invoice', invoice);
            }
            else {
              res.render('error', { errorMsg: 'Error: Cannot convert USD to BTC.' });
            }
          });
        }
        else {
          res.render('invoice', invoice);
        }
      }
    });
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
        // log the created invoice
        console.log(invoice);
        res.end();
      }
    });
  });
};

module.exports = main;

main(app);
app.listen(config.port);
console.log('HTTP Server on port: ' + config.port);
