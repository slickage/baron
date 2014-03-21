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
  helper.convertToBtc(function(error, response, body) {
    // calculate amount
    if (!error && response.statusCode == 200) {
      var rate = Number(JSON.parse(body).vwap);
      if (currency === 'USD') {
        console.log(amount + '/' + rate + '=' + amount/rate);
        amount = amount/rate;
      }
    }

    payments.getPaymentAddress(function(err, address) {
      // remove testnet parameter for production
      if (btcAddr.validate(address, 'testnet')) {
        res.render('pay', {
          address: address,
          amount: amount,
          currency: currency,
          amountFirstFour: helper.toFourDecimals(amount.toFixed(8)),
          amountLastFour: helper.getLastFourDecimals(amount.toFixed(8)),
          qrImageUrl: '/paymentqr?address=' + address + '&amount=' + helper.convertToBtc(amount, currency)
        });
      }
      else {
        res.render('error', { errorMsg: 'Address is invalid: The bitcoin address entered is invalid.' });
      }
    });    

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

app.get('/invoices/:invoiceId', function(req, res) {
  db.findInvoice(req.params.invoiceId, function(err, results) {
    if (!err) {
      res.json(results);
    }
    else {
      res.write(err);
    }
  });
});

app.post('/invoices', function(req, res) {
  var newInvoice = req.body;
  db.createInvoice(newInvoice, function(err, doc) {
    if(err) {
      res.end();
    }
    else {
      res.end();
    }
  });
});

app.listen(config.port);
console.log('HTTP Server on port: ' + config.port);
