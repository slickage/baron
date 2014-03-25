var payments = require('../payments');
var helper = require('../helper');
var db = require('../db');
var btcAddr = require('bitcoin-address');


var pay = function(app) {

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
};

module.exports = pay;
