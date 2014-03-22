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
  - update /pay to receive its params from the body instead of query string
  - does the invoice object need to be aware of the payment object?
  - totalAmount is always stored as BTC
  - If a invoice is set to a certain currency we display the invoice in that currency
    payment is still in btc
*/

app.get('/pay', function(req, res) {
  var amount = Number(req.query.amount);
  var currency = req.query.currency;
  if (!helper.isNumber(amount)) {
    res.render('error', { errorMsg: 'Amount is invalid: Bitcoin amount entered was not a number.' });
  }

  var amountDecimals = helper.decimalPlaces(amount);
  if (amountDecimals > 8) {
    res.render('error', { errorMsg: 'Amount is invalid: Bitcoin amount must have 8 or less decimal places.' });
  }

  // Change this later to query from db not directly from api
  helper.convertToBtc(function(err, response, body) {
    // calculate amount
    if (!err && response.statusCode == 200) {
      var rate = Number(JSON.parse(body).vwap);
      if (currency === 'USD') {
        amount = amount/rate;
      }
      // round amount to 8 decimal places
      amount = helper.roundToEightDecimals(amount);
      payments.getPaymentAddress(function(err, address) {
        // remove testnet parameter for production
        if (btcAddr.validate(address, 'testnet')) {
          res.render('pay', {
            address: address,
            amount: amount,
            currency: currency,
            amountFirstFour: helper.toFourDecimals(amount),
            amountLastFour: helper.getLastFourDecimals(amount),
            qrImageUrl: '/paymentqr?address=' + address + '&amount=' + amount
          });
        }
        else {
          res.render('error', { errorMsg: 'Cannot generate valid payment address.' });
        }
      });    
    }
    else {
      res.render('error', { errorMsg: 'Error calculating exchange rate.' });
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
      console.log(Object.keys(paymentArr).length);
      if (Object.keys(paymentArr).length > 0) {
        res.redirect("/pay/" + invoiceId);    
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

            db.updateInvoice(invoice, 
            function(err, docs) {
                if (err) {
                  res.write('error', { errorMsg: 'Error creating payment for invoice.' });
                  res.end();
                }
                else {
                  res.redirect("/pay/" + invoiceId);    
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
      console.log("keys: " + keys);
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
            currency: invoice.currency,
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
  db.findInvoice(req.params.invoiceId, function(err, invoiceData) {
    if (err) {
      res.write(err.message);
      res.end();
    }
    else {
      res.render('invoice', invoiceData);
    }
  });
});

// Creates new invoice
app.post('/invoices', function(req, res) {
  var newInvoice = req.body;
  db.createInvoice(newInvoice, function(err, docs) {
    if(err) {
      res.write(err.message);
      res.end();
    }
    else {
      // log the created invoice
      console.log(docs);
      res.end();
    }
  });
});

app.listen(config.port);
console.log('HTTP Server on port: ' + config.port);
