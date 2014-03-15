var config = require('./config');
var path = require('path');
var payments = require('./payments');
var express = require('express');
var qr = require('qr-image');
var app = express();
app.set('view engine', 'ejs');
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/pay', function(req, res) {
  var amount = req.query.amount;
  payments.getPaymentAddress(function(err, address) {
    res.render('pay', {
      address: address,
      amount: amount,
      qrImageUrl: '/paymentqr?address=' + address + '&amount=' + amount
    });
  })
});

app.get('/paymentqr', function(req, res) {
  var address = req.query.address;
  if (!address) {
    res.send('No address defined.');
  }
  var amount = req.query.amount || undefined;
  var code = qr.image('bitcoin:' + address + '&amount=' + amount, { type: 'png' });
  code.pipe(res);
});

app.listen(config.port);
console.log('HTTP Server on port: ' + config.port);
