var paymentUtil = require(__dirname + '/../../paymentutil');
var invoiceHelper = require(__dirname + '/../../invoicehelper');
var helper = require(__dirname + '/../../helper');
var validate = require(__dirname + '/../../validate');
var bitcoinUtil = require(__dirname + '/../../bitcoinutil');
var config = require(__dirname + '/../../config');
var BigNumber = require('bignumber.js');
var db = require(__dirname + '/../../db');

var findOrCreatePayment = function(invoiceId, cb) {
  db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
    if (err) {
      return cb(err, null);
    }
    var activePayment = invoiceHelper.getActivePayment(paymentsArr);

    // Invoice is expired and unpaid
    if (invoice.is_void) {
      var voidErr = new Error('Error: Invoice associated with payment is void.');
      return cb(voidErr, null);
    }
    else if (validate.invoiceExpired(invoice) && activePayment && activePayment.status === 'unpaid') {
      var expiredErr = new Error('Error: Invoice associated with payment is expired.');
      return cb(expiredErr, null);
    }

    if (activePayment && (activePayment.watched || activePayment.status === 'paid' || activePayment.status === 'overpaid')) {
      var invoiceIsPaid = new BigNumber(activePayment.amount_paid).gte(activePayment.expected_amount);
      var invoiceIsUnpaid = new BigNumber(activePayment.amount_paid).equals(0);
      if (invoiceIsPaid || invoiceIsUnpaid) {
        var remainingBalance = new BigNumber(activePayment.expected_amount).minus(activePayment.amount_paid);
        var result = {
          payment: activePayment,
          invoice: invoice,
          remainingBalance: remainingBalance
        };
        return cb(null, result);
      }
    }

    // Create a new payment object for invoices without a payment or with a partial payment
    invoiceHelper.getAmountDueBTC(invoice, paymentsArr, function(err, amountDue) {
      if (err) {
        return cb(err, null);
      }
      paymentUtil.createNewPayment(invoiceId, amountDue, function(err, newPayment) {
        if (err) {
          return cb(err, null);
        }
        var result = {
          payment: newPayment,
          invoice: invoice,
          remainingBalance: amountDue
        };
        return cb(null, result);
      });
    });
  });
};

function buildFormattedPaymentData(activePayment, invoice, remainingBalance, cb) {
  var owedAmount = activePayment.expected_amount;
  // Check if invoice is paid
  var invoicePaid;
  if (remainingBalance <= 0 && activePayment.status !=='pending' && activePayment.block_hash) {
    invoicePaid = true;
  }

  // Get Confirmations
  bitcoinUtil.getBlock(activePayment.block_hash, function(err, block) {
    // TODO: err.code === 0  is ECONNREFUSED, display error to user?
    var confirmations = 0;
    block = block.result;
    if (err || !block) {
      confirmations = 0;
    }
    else if (block) {
      confirmations = block.confirmations;
    }

    var validMins = config.paymentValidForMinutes * 60 * 1000;
    var expiration = activePayment.created + validMins;
    var isUSD = invoice.currency.toUpperCase() === 'USD';
    var amountToDisplay = activePayment.amount_paid > 0 ? activePayment.amount_paid : owedAmount;
    var chainExplorerUrl = activePayment.txid ? config.chainExplorerUrl + '/' + activePayment.txid : null;
    var txid = activePayment.txid ? activePayment.txid : null;
    var paymentData = {
      appTitle: config.appTitle,
      minConfirmations: invoice.min_confirmations,
      blockHash: activePayment.block_hash,
      expireTime: expiration,
      expires: helper.getExpirationCountDown(expiration),
      remainingBalance: Number(remainingBalance),
      invoicePaid: invoicePaid,
      invoiceId: invoice._id,
      isUSD: isUSD, // Refresh is only needed for invoices in USD
      status: activePayment.status,
      address: activePayment.address,
      confirmations: confirmations,
      txid: txid,
      amount: amountToDisplay,
      amountFirstFour: helper.toFourDecimals(amountToDisplay),
      amountLastFour: helper.getLastFourDecimals(amountToDisplay),
      chainExplorerUrl: chainExplorerUrl,
      qrImageUrl: txid ? null : '/paymentqr?address=' + activePayment.address + '&amount=' + amountToDisplay,
      bitcoinUrl: txid ? null : 'bitcoin:' + activePayment.address + '?amount=' +  amountToDisplay,
    };

    return cb(null, paymentData);
  });
}

var createPaymentDataForView = function(invoiceId, cb) {
  findOrCreatePayment(invoiceId, function(err, result) {
    if (err) {
      return cb(err, null);
    }
    else {
      buildFormattedPaymentData(result.payment, result.invoice, result.remainingBalance, cb);
    }
  });
};

module.exports = {
  findOrCreatePayment:findOrCreatePayment,
  createPaymentDataForView: createPaymentDataForView
};
