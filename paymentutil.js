/* jshint node: true */
'use strict';

var helper = require(__dirname + '/helper');
var validate = require(__dirname + '/validate');
var BigNumber = require('bignumber.js');
var bitstamped = require(__dirname + '/bitstamped');
var bitcoinUtil = require(__dirname + '/bitcoinutil');
var db = require(__dirname + '/db');
var config = require(__dirname + '/config');
var invoiceHelper = require(__dirname + '/invoicehelper');
var invoiceWebhooks = require(__dirname + '/invoicewebhooks');
var _ = require('lodash');
var heckler = require('heckler');

// ===============================================
// Creating New Payments with Transaction Data
// ===============================================

function stopWatchingPayment(paymentId) {
  db.findPaymentById(paymentId, function(err, payment) {
    if (err || !payment) {
      return console.log('Error retrieving payment by id');
    }
    if (payment.watched && Number(payment.amount_paid) === 0) {
      payment.watched = false;
      db.insert(payment);
    }
  });
}

function resetPayment(payment, expectedAmount, cb) {
  var curTime = new Date().getTime();
  bitstamped.getTicker(curTime, function(err, docs) {
    if (!err && docs.rows && docs.rows.length > 0) {
      var tickerData = docs.rows[0].value;
      var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price
      payment.expected_amount = expectedAmount;
      payment.spot_rate = rate;
      payment.watched = true;
      payment.created = new Date().getTime();
      db.insert(payment, function(err, result) {
        if (err) {
          return cb(err, null);
        }
        else {
          setTimeout(stopWatchingPayment, config.spotRateValidForMinutes * 60 * 1000, result.id);
          return cb(null, payment);
        }
      });
    }
    else {
      return cb(err, null);
    }
  });
}

// Inserts a new payment into the db
function insertPayment(invoice, address, expectedAmount, cb) {
  var curTime = new Date().getTime();
  bitstamped.getTicker(curTime, function(err, docs) {
    if (!err && docs.rows && docs.rows.length > 0) {
      var tickerData = docs.rows[0].value;
      var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price
      var payment = {
        _id: helper.pseudoRandomHex(32),
        invoice_id: invoice._id,
        address: address,
        amount_paid: 0, // Always stored in BTC
        expected_amount: expectedAmount,
        blockhash: null,
        spot_rate: rate,
        status: 'unpaid',
        created: new Date().getTime(),
        paid_timestamp: null,
        text: invoice.text,
        title: invoice.title,
        txid: null, // Bitcoind txid for transaction
        watched: true, // Watch payments till 100 conf or expired
        type: 'payment'
      };
      db.insert(payment, function(err, result) {
        if (err) {
          return cb(err, null);
        }
        else {
          setTimeout(stopWatchingPayment, config.spotRateValidForMinutes * 60 * 1000, result.id);
          payment._id = result.id;
          return cb(null, payment);
        }
      });
    }
    else {
      return cb(err, null);
    }
  });
}

// Creates a new payment object associated with invoice
var createNewPayment = function(invoiceId, expectedAmount, cb) {
  db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
    if (!err && invoice && paymentsArr.length > 0) {
      var activePayment = invoiceHelper.getActivePayment(paymentsArr);
      if(!activePayment.watched && Number(activePayment.amount_paid) === 0) {
        resetPayment(activePayment, expectedAmount, cb);
      }
    }
    bitcoinUtil.getNewAddress(function(err, info) {
      if (err) {
        return cb(err, null);
      }
      else {
        insertPayment(invoice, info.result, expectedAmount, cb);
      }
    });
  });
};

// ===============================================
// Updating Payments with Transaction Data
// ===============================================

// Updates payment with transaction from listsinceblock, walletnotify, or watchpaymentjob
var updatePaymentWithTransaction = function(payment, transaction, cb) {
  db.findInvoice(payment.invoice_id, function(err, invoice) {
    if (err) {
      return cb(err);
    }
    var origStatus = payment.status;
    var newConfirmations = transaction.confirmations;
    var curStatus = helper.getPaymentStatus(payment, newConfirmations, invoice);
    if(validate.paymentChanged(payment, transaction, curStatus)) {
      //console.log('DEBUG Payment changed ' + transaction.txid);
      // Add Reorg History
      if (payment.blockhash && transaction.blockhash !== payment.blockhash) {
        // payment's block hash is no longer in the transaction
        // record old block hash in reorg_history
        var reorgHistory = payment.reorg_history ? payment.reorg_history : [];
        if (!_.contains(reorgHistory, payment.blockhash)) {
          reorgHistory.push(payment.blockhash);
          payment.reorg_history = reorgHistory;
        }
      }
      // Add Double-Spend History
      if (transaction.walletconflicts.length > 0) {
        payment.double_spent_history = transaction.walletconflicts;
      }

      // Update payment with transaction data
      var amount = transaction.amount;
      payment.amount_paid = amount;
      payment.txid = transaction.txid;
      payment.blockhash = transaction.blockhash ? transaction.blockhash : null;
      payment.paid_timestamp = transaction.time * 1000;
      payment.watched = newConfirmations === -1 ? false : newConfirmations < config.trackPaymentUntilConf;
      var isUSD = invoice.currency.toUpperCase() === 'USD';
      if (isUSD) {
        var actualPaid = new BigNumber(amount).times(payment.spot_rate);
        var expectedPaid = new BigNumber(payment.expected_amount).times(payment.spot_rate);
        actualPaid = helper.roundToDecimal(actualPaid.valueOf(), 2);
        expectedPaid = helper.roundToDecimal(expectedPaid.valueOf(), 2);
        var closeEnough = new BigNumber(actualPaid).equals(expectedPaid);
        if (closeEnough) {
          payment.expected_amount = amount;
        }
      }
      // Update status after updating amounts
      payment.status = helper.getPaymentStatus(payment, newConfirmations, invoice);
      db.insert(payment, function (err) {
        if (err) {
          if (err.error && err.error === 'conflict' ) {
            // Expected and harmless
            //console.log('DEBUG updatePaymentWithTransaction: Document update conflict: ' + JSON.stringify(err.request.body));
          }
          else {
            console.log('DEBUG updatePaymentWithTransaction: ' + JSON.stringify(err));
          }
        }
        else {
          invoiceWebhooks.determineWebhookCall(payment.invoice_id, origStatus, payment.status);
          if (payment.status.toLowerCase() === 'invalid') {
            // TODO: Get rid of capitalized status names, capitalize it in only in the view
            heckler.email(helper.getInvalidEmail(payment.txid, payment.invoice_id));
          }
        }
        return cb(); // Discard errors
      });
    }
  });
};

// Handles case where user sends multiple payments to same address
// Creates payment with transaction data from listsinceblock or walletnotify
function createNewPaymentWithTransaction(invoiceId, transaction, cb) {
  var paidTime = transaction.time * 1000;
  db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
    if (err) {
      return cb(err);
    }
    bitstamped.getTicker(paidTime, function(err, docs) {
      if (!err && docs.rows && docs.rows.length > 0) {
        var tickerData = docs.rows[0].value;
        var rate = new BigNumber(tickerData.vwap);
        var totalPaid = new BigNumber(invoiceHelper.getTotalPaid(invoice, paymentsArr));
        var remainingBalance = new BigNumber(invoice.balance_due).minus(totalPaid);
        var isUSD = invoice.currency.toUpperCase() === 'USD';
        if (isUSD) {
          var actualPaid = helper.roundToDecimal(rate.times(transaction.amount).valueOf(), 2);
          var closeEnough = new BigNumber(actualPaid).equals(helper.roundToDecimal(remainingBalance, 2));
          if (closeEnough) {
            remainingBalance = transaction.amount;
          }
          else {
            remainingBalance = Number(remainingBalance.dividedBy(rate).valueOf());
          }
        }
        remainingBalance = helper.roundToDecimal(remainingBalance, 8);
        var payment = {
          _id: invoiceId + '_' + transaction.txid,
          invoice_id: invoiceId,
          address: transaction.address,
          amount_paid: Number(transaction.amount),
          expected_amount: Number(remainingBalance),
          blockhash: transaction.blockhash ? transaction.blockhash : null,
          spot_rate: Number(rate.valueOf()), // Exchange rate at time of payment
          created: new Date().getTime(),
          paid_timestamp: paidTime,
          title: invoice.title,
          txid: transaction.txid, // Bitcoind txid for transaction
          watched: true,
          type: 'payment'
        };
        payment.status = helper.getPaymentStatus(payment, transaction.confirmations, invoice);

        // New transaction to known address has wallet conflicts. This indicates that 
        // this transaction is a mutated tx of a known payment.
        if (transaction.walletconflicts.length > 0) {
          payment.double_spent_history = transaction.walletconflicts;
          var latestConflictingTx = transaction.walletconflicts[transaction.walletconflicts.length - 1];
          // Need to grab spot rate and expected_amount from conflicting payment
          paymentsArr.forEach(function(curPayment) {
            if (curPayment.txid === latestConflictingTx) {
              payment.expected_amount = curPayment.expected_amount;
              payment.spot_rate = curPayment.spot_rate;
            }
          });
        }
        db.insert(payment, function(err) {
          if (err) {
            if (err.error && err.error === 'conflict' ) {
              // Expected and harmless
              //console.log('DEBUG createNewPaymentWithTransaction: Document update conflict: ' + JSON.stringify(err.request.body));
            }
            else {
              console.log('DEBUG createNewPaymentWithTransaction: ' + JSON.stringify(err));
            }
            return cb();
          }
        });
      }
      else {
        return cb(err);
      }
    });
  });
}

// Updates payment (called by walletnotify and updatePaymentsSinceBlock)
var updatePayment = function(transaction, cb) {
  if (!transaction.txid || !transaction.address || transaction.amount < 0) {
    var error = new Error('Ignoring irrelevant transaction.');
    return cb(error, null);
  }
  db.findPaymentsByTxId(transaction.txid, function(err, payments) {
    var payment;
    payments.forEach(function(curPayment) {
      if (curPayment.address === transaction.address) {
        payment = curPayment;
      }
    });
    if (payment) {
      updatePaymentWithTransaction(payment, transaction, cb);
    }
    else {
      // look up payment by address, maybe it hasnt got a txid yet
      db.findPayments(transaction.address, function(err, paymentsArr) {
        if (err) {
          return cb(err, null);
        }
        var invoiceId = null;
        paymentsArr.forEach(function(payment) {
          if (!payment.txid) {
            // Initial update from walletnotify
            updatePaymentWithTransaction(payment, transaction, cb);
          }
          else {
            invoiceId = payment.invoice_id;
          }
        });
        if (invoiceId) {
          // Create new payment for same invoice as pre-existing payment
          createNewPaymentWithTransaction(invoiceId, transaction, cb);
        }
      });
    }
  });
};

module.exports = {
  createNewPayment: createNewPayment,
  updatePayment: updatePayment,
  updatePaymentWithTransaction: updatePaymentWithTransaction
};

