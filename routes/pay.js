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
    db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
      // Validate that invoice exists and is not expired
      if (err || validate.invoiceExpired(invoice)) {
        var errorMsg = err ? err.toString() : 'Error: Invoice associated with payment is expired.';
        return res.render('error', { errorMsg:errorMsg });
      }

      // If payment exists and it's not partially paid redirect to display payment view
      var activePayment = getActivePayment(paymentsArr);
      if (activePayment && activePayment.status !== 'partial') {
        return res.redirect('/pay/' + invoiceId);
      }

      // Create a new payment object for invoices without a payment or with a partial payment
      createNewPayment(invoiceId, function(err, doc) {
        if (err) {
          return res.render('error', { errorMsg: 'Error creating payment for invoice.' });
        }
        return res.redirect('/pay/' + invoiceId);
      });
    });
  });

  // Displays payment for given invoiceId
  app.get('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
      var activePayment = getActivePayment(paymentsArr); // Get active payment for invoice
      var expired =  validate.invoiceExpired(invoice);

      var errorMsg = ''; // Set error message based on point of failure
      if (expired) { errorMsg = 'Error: Invoice associated with payment is expired.'; }
      else if (!activePayment) { errorMsg = 'Error: Invoice does not has no active payments.'; }
      else if (err) { errorMsg = err.toString(); }

      // Render error view with message
      if (err || expired || !activePayment) {
        return res.render('error', { errorMsg:errorMsg });
      }

      // Calculate the remaining balance and render the payment view
      calculateRemainingBalance(invoice, paymentsArr, function (err, remainingBalance) {
        // Error checking
        if (err) { return res.json({ error: err }); }
        var isUSD = invoice.currency.toUpperCase() === 'USD';
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
      });
      
    });
  });
};

function calculateRemainingBalance(invoice, paymentsArr, cb) {
  var isUSD = invoice.currency.toUpperCase() === 'USD';
  var totalPaid = getTotalPaid(paymentsArr, isUSD);
  var remainingBalance = invoice.balance_due - totalPaid;
  if (isUSD) {
    remainingBalance = helper.roundToDecimal(remainingBalance, 2); // Round to 2 places for USD
    var curTime = new Date().getTime();
    bitstamped.getTicker(curTime, function(err, docs) {
      if (!err && docs.rows && docs.rows.length > 0) {
        var tickerData = docs.rows[0].value; // Get ticker object
        var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price
        invoice.balance_due = helper.roundToDecimal(remainingBalance / rate, 8);
        remainingBalance = invoice.balance_due;
      }
      return cb(err, remainingBalance);
    });
  }
  else {
    return cb(null, remainingBalance);
  }
}

function createNewPayment(invoiceId, cb) {
  payments.getPaymentAddress(function(err, address) { // Get payment address from bitcond
    if (err) {
      return cb(err, undefined);
    }
    else if (!btcAddr.validate(address, 'testnet')) {
      return cb('Cannot generate valid payment address.', undefined);
    }
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

    // Add payment object to database
    db.createPayment(payment, cb);
    
  });
}

function getActivePayment(paymentsArr, cb) {
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
  return activePayment;
}

function getTotalPaid(paymentsArr, convert) {
  var totalPaid = 0;
  paymentsArr.forEach(function(payment) {
      var paidAmount = payment.amount_paid;
      if (paidAmount) {
        // If invoice is in USD then we must multiply the amount paid (BTC) by the spot rate (USD)
        totalPaid += convert ? paidAmount * payment.spot_rate : paidAmount;
      }
  });
  return totalPaid;
}

module.exports = pay;
