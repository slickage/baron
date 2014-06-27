/* jshint node: true */
'use strict';

var paymentUtil = require(__dirname + '/../../paymentutil');
var invoiceHelper = require(__dirname + '/../../invoicehelper');
var helper = require(__dirname + '/../../helper');
var validate = require(__dirname + '/../../validate');
var bitcoinUtil = require(__dirname + '/../../bitcoinutil');
var config = require(__dirname + '/../../config');
var BigNumber = require('bignumber.js');
var db = require(__dirname + '/../../db');
var async = require('async');

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

var createPaymentDataForView = function(invoiceId, callback) {
  var activePayment, invoice, remainingBalance, confirmations;

  async.waterfall([
    function(cb) {
      findOrCreatePayment(invoiceId, function(err, result) {
        if (err) {
          err.which = 'createPaymentDataForView findOrCreatePayment';
          cb(err, null);
        }
        else {
          activePayment = result.payment;
          invoice = result.invoice;
          remainingBalance = result.remainingBalance;
          cb();
        }
      });
    },
    function(cb) {
      // Get confirmations from getBlock
      if (activePayment.blockhash) {
        bitcoinUtil.getBlock(activePayment.blockhash, function(err, block) {
          if (err) {
            err.which = 'createPaymentDataForView getBlock';
            cb(err, null);
          }
          else {
            confirmations = block.result.confirmations;
            cb();
          }
        });
      }
      else {
        // or 0 if no blockhash
        confirmations = 0;
        cb();
      }
    },
    function(cb) {
      // Construct paymentData
      var owedAmount = activePayment.expected_amount;
      var validMins = config.spotRateValidForMinutes * 60 * 1000;
      var expiration = activePayment.created + validMins;
      var isUSD = invoice.currency.toUpperCase() === 'USD';
      var amountToDisplay = activePayment.amount_paid > 0 ? activePayment.amount_paid : owedAmount;
      var chainExplorerUrl = activePayment.txid ? config.chainExplorerUrl + '/' + activePayment.txid : null;
      var txid = activePayment.txid ? activePayment.txid : null;
      var invoicePaid;
      if (activePayment.blockhash && remainingBalance <= 0 && activePayment.status !=='pending') {
        invoicePaid = true;
      }
      var paymentData = {
        title: invoice.title ? invoice.title : config.appTitle,
        minConfirmations: invoice.min_confirmations,
        blockHash: activePayment.blockhash,
        expireTime: expiration,
        expires: helper.getExpirationCountDown(expiration),
        remainingBalance: Number(remainingBalance),
        invoicePaid: invoicePaid,
        invoiceId: invoice._id,
        isUSD: isUSD, // Refresh is only needed for invoices in USD
        status: activePayment.status,
        address: activePayment.address,
        confirmations: confirmations,
        text: invoice.text ? invoice.text : null,
        txid: txid,
        amount: amountToDisplay,
        amountFirstFour: helper.toFourDecimals(amountToDisplay),
        amountLastFour: helper.getLastFourDecimals(amountToDisplay),
        chainExplorerUrl: chainExplorerUrl,
        qrImageUrl: txid ? null : '/paymentqr?address=' + activePayment.address + '&amount=' + amountToDisplay,
        bitcoinUrl: txid ? null : 'bitcoin:' + activePayment.address + '?amount=' +  amountToDisplay,
      };
      cb(null, paymentData);
    }
  ],
  function (err, result) {
    if (err) {
      return callback(err, null);
    }
    else {
      return callback(null, result);
    }
  });

};

module.exports = {
  findOrCreatePayment:findOrCreatePayment,
  createPaymentDataForView: createPaymentDataForView
};
