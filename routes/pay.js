var invoiceUtil = require('../invoiceutil');
var helper = require('../helper');
var validate = require('../validate');
var api = require('../insightapi');
var config = require('../config');
var BigNumber = require('bignumber.js');
var db = require('../db');

function findOrCreatePayment(invoiceId, cb) {
  db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
    if (err) { return cb(err, null); }

    // Check if invoice is expired.
    if (validate.invoiceExpired(invoice)) {
      var expiredErr = new Error('Error: Invoice associated with payment is expired.');
      return cb(expiredErr, null);
    }

    // If active payment is partially paid, need to create new payment
    var activePayment = invoiceUtil.getActivePayment(paymentsArr);
    if (activePayment) {
      var invoiceIsPaid = new BigNumber(activePayment.amount_paid).gte(activePayment.expected_amount);
      var invoiceIsUnpaid = new BigNumber(activePayment.amount_paid).equals(0);
      if (invoiceIsPaid || invoiceIsUnpaid) {
        var remainingBalance = new BigNumber(activePayment.expected_amount).minus(activePayment.amount_paid);
        return cb(null, { payment: activePayment, invoice: invoice, remainingBalance: remainingBalance });
      }
    }

    // Create a new payment object for invoices without a payment or with a partial payment
    invoiceUtil.calculateRemainingBalance(invoice, paymentsArr, function(err, remainingBalance) {
      if (err) { return cb(err, null); }
      invoiceUtil.createNewPayment(invoiceId, remainingBalance, function(err, newPayment) {
        if (err) { return cb(err, null); }
        return cb(null, { payment: newPayment, invoice: invoice, remainingBalance: remainingBalance });
      });
    });
  });
}

function buildPaymentData(activePayment, invoice, remainingBalance, cb) {
  var owedAmount = activePayment.expected_amount;
  // Check if invoice is paid
  var invoicePaid;
  if (remainingBalance <= 0 && activePayment.status !=='pending' && activePayment.block_hash) {
    invoicePaid = true;
  }

  // Get Confirmations
  api.getBlock(activePayment.block_hash, function(err, block) {
    var confirmations = 0;
    if (err || !block) { confirmations = 0; }
    else if (block) {
      confirmations = block.confirmations;
    }
    var isUSD = invoice.currency.toUpperCase() === 'USD';
    var amountToDisplay = activePayment.amount_paid > 0 ? activePayment.amount_paid : owedAmount;
    var url = activePayment.tx_id ? config.chainExplorerUrl + '/' + activePayment.tx_id : null;
    var paymentData = {
      validFor: config.paymentValidForMinutes,
      remainingBalance: remainingBalance,
      invoicePaid: invoicePaid,
      invoiceId: invoice._id,
      showRefresh: isUSD, // Refresh is only needed for invoices in USD
      url: url,
      status: activePayment.status,
      address: activePayment.address,
      confirmations: confirmations,
      ntxId: activePayment.ntx_id,
      amount: amountToDisplay,
      amountFirstFour: helper.toFourDecimals(amountToDisplay),
      amountLastFour: helper.getLastFourDecimals(amountToDisplay),
      qrImageUrl: '/paymentqr?address=' + activePayment.address + '&amount=' + amountToDisplay
    };

    return cb(null, paymentData);
  });
}

function createPaymentDataForVew(invoiceId, cb) {
  findOrCreatePayment(invoiceId, function(err, result) {
    if (err) {
      return cb(err, null);
    }
    else {
      buildPaymentData(result.payment, result.invoice, result.remainingBalance, cb);
    }
  });
}

var pay = function(app) {

  // Creates a new payment or redirects to existing payment
  app.post('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    findOrCreatePayment(invoiceId, function (err) {
      if (err) {
        return res.render('error', {errorMsg: err.message });
      }
      else {
        return res.redirect('/pay/' + invoiceId);
      }
    });
  });

  // Displays payment for given invoiceId
  app.get('/pay/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    createPaymentDataForVew(invoiceId, function(err, paymentData) {
      if (err) {
        return res.render('error', {errorMsg: err.message });
      }
      else {
        return res.render('pay', paymentData);
      }
    });
  });

};

module.exports = pay;
