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
  - when creating a payment do we store current USD and BTC?
  - should /pay always take the amount in BTC then convert if the currency=USD?
  - How do we handle currency on payment page vs invoice page? 
    Right now amount will be read as usd if currency is set to usd.
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
        console.log(amount + '/' + rate + '=' + Math.round((amount/rate) * 100000000)/100000000);
        amount = amount/rate;
      }
      // round amount to 8 decimal places
      amount = Math.round(amount * 100000000) / 100000000;
      payments.getPaymentAddress(function(err, address) {
        // remove testnet parameter for production
        if (btcAddr.validate(address, 'testnet')) {
          res.render('pay', {
            address: address,
            amount: amount,
            currency: currency,
            amountFirstFour: helper.toFourDecimals(amount.toFixed(8)),
            amountLastFour: helper.getLastFourDecimals(amount.toFixed(8)),
            // this amount needs to be rounded
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

app.get('/pay/:paymentId', function(req, res) {
  db.findPayment(req.params.paymentId, function(err, payment) {
    if (err) {
      res.render('error', { errorMsg: 'Cannot find payment.' });
    }
    else {
      var amount = Number(payment.totalAmount);

      // Change this later to query from db not directly from api
      helper.convertToBtc(function(err, response, body) {
        // calculate amount
        if (!err && response.statusCode == 200) {
          if (payment.currency === 'USD') {
            var rate = Number(JSON.parse(body).vwap);
            console.log(amount + '/' + rate + '=' + Math.round((amount/rate) * 100000000)/100000000);
            amount = amount/rate;
          }
          // round amount to 8 decimal places
          amount = Math.round(amount * 100000000) / 100000000;
          console.log(Math.round(Number(amount) * 100000000)/100000000);
          res.render('pay', {
            address: payment.address,
            amount: amount,
            currency: payment.currency,
            amountFirstFour: helper.toFourDecimals(amount.toFixed(8)),
            amountLastFour: helper.getLastFourDecimals(amount.toFixed(8)),
            // This amount needs to be rounded
            qrImageUrl: '/paymentqr?address=' + payment.address + '&amount=' + amount
          });
        }
      });
    }
  });
});

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

// View invoice by id
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

// Handling post from pay button then redirects to /pay
app.post('/invoices/:invoiceId', function(req, res) {
  db.findInvoice(req.params.invoiceId, function(err, invoiceData) {
    if (err) {
      res.write(err.message);
      res.end();
    }
    else {
      // Create payment address
      payments.getPaymentAddress(function(err, address) {
        // remove testnet parameter for production
        if (btcAddr.validate(address, 'testnet')) {
          // Create payment object
          db.createPayment({ 
          'address':address, 
          'totalAmount':invoiceData.totalAmount, 
          'currency':req.body.currency, 
          'invoiceId':req.params.invoiceId }, 
          function(err, docs) {
              if (err) {
                res.write('error', { errorMsg: 'Error creating payment.' });
                res.end();
              }
              else {
                var paymentId = docs[0]._id;
                res.redirect("/pay/" + paymentId);    
              }
          });
        }
        else {
          res.render('error', { errorMsg: 'Cannot generate valid payment address.' });
        }
      });
    }
  });
});

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
