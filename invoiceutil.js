var helper = require('./helper');
var validate = require('./validate');
var BigNumber = require('bignumber.js');
var bitstamped = require('bitstamped');
var bitcoinUtil = require('./bitcoinutil');
var db = require('./db');
var api = require('./insightapi');
var config = require('./config');
var lodash = require('lodash');

// ===============================================
// Miscellaneous Invoice Utilities
// ===============================================

// Calculates line totals for invoice line items
var calculateLineTotals = function(invoice) {
  var isUSD = invoice.currency.toUpperCase() === 'USD';
  invoice.line_items.forEach(function (item){
    item.line_total = Number(new BigNumber(item.amount).times(item.quantity).valueOf());
    if (isUSD) { // Round USD to two decimals
      item.amount = helper.roundToDecimal(item.amount, 2);
      item.line_total = helper.roundToDecimal(item.line_total, 2);
    }
    // If our calculated line total has more than 8 decimals round to 8
    else if (helper.decimalPlaces(item.line_total) > 8) {
      item.line_total = helper.roundToDecimal(item.line_total, 8);
    }
  });
};

// Returns the latest payment object
var getActivePayment = function(paymentsArr) {
  var activePayment;
  paymentsArr.forEach(function(payment) {
    if (activePayment) {
      activePayment = payment.created > activePayment.created ? payment : activePayment;
    }
    else {
      activePayment = payment;
    }
  });
  return activePayment;
};

// Calculates the invoice's paid amount
var getTotalPaid = function(invoice, paymentsArr) {
  var isUSD = invoice.currency.toUpperCase() === 'USD';
  var totalPaid = new BigNumber(0);
  paymentsArr.forEach(function(payment) {
    var paidAmount = payment.amount_paid;
    if (paidAmount) {
      paidAmount = new BigNumber(paidAmount);
      // If invoice is in USD then we must multiply the amount paid (BTC) by the spot rate (USD)
      if (isUSD) {
        var usdAmount = helper.roundToDecimal(paidAmount.times(payment.spot_rate).valueOf(), 2);
        totalPaid = totalPaid.plus(usdAmount);
      }
      else {
        totalPaid = totalPaid.plus(paidAmount);
      }
    }
  });
  if (isUSD) {
    totalPaid = helper.roundToDecimal(Number(totalPaid.valueOf()), 2);
  }
  return totalPaid;
};

// Calculates the invoice's remaining balance
var calculateRemainingBalance = function(invoice, paymentsArr, cb) {
  var isUSD = invoice.currency.toUpperCase() === 'USD';
  var totalPaid = getTotalPaid(invoice, paymentsArr);
  var remainingBalance = new BigNumber(invoice.balance_due).minus(totalPaid);
  if (isUSD) {
    var curTime = new Date().getTime();
    bitstamped.getTicker(curTime, function(err, docs) {
      if (!err && docs.rows && docs.rows.length > 0) {
        var tickerData = docs.rows[0].value; // Get ticker object
        var rate = new BigNumber(tickerData.vwap); // Bitcoin volume weighted average price
        remainingBalance = Number(remainingBalance.dividedBy(rate).valueOf());
        remainingBalance = helper.roundToDecimal(remainingBalance, 8);
        return cb(null, Number(remainingBalance));
      }
      else {
        return cb(err, null);
      }
    });
  }
  else {
    return cb(null, Number(remainingBalance.valueOf()));
  }
};

// Returns array of payments that are not in unpaid status
var getPaymentHistory = function(paymentsArr) {
  var history = [];
  paymentsArr.forEach(function(payment) {
    var status = payment.status;
    if(status.toLowerCase() !== 'unpaid' && payment.tx_id) {
      history.push(payment);
    }
    // Capitalizing first letter of payment status for display in invoice view
    payment.status = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  });
  return history;
};

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
          setTimeout(stopWatchingPayment, config.paymentValidForMinutes * 60 * 1000, result.id);
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
function insertPayment(invoiceId, address, expectedAmount, cb) {
  var curTime = new Date().getTime();
  bitstamped.getTicker(curTime, function(err, docs) {
    if (!err && docs.rows && docs.rows.length > 0) {
      var tickerData = docs.rows[0].value;
      var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price
      var payment = {
        invoice_id: invoiceId,
        address: address,
        amount_paid: 0, // Always stored in BTC
        expected_amount: expectedAmount,
        block_hash: null,
        spot_rate: rate,
        status: 'unpaid',
        created: new Date().getTime(),
        paid_timestamp: null,
        tx_id: null, // Bitcoind txid for transaction
        watched: true, // Watch payments till 100 conf or expired
        type: 'payment'
      };
      db.insert(payment, function(err, result) {
        if (err) {
          return cb(err, null);
        }
        else {
          setTimeout(stopWatchingPayment, config.paymentValidForMinutes * 60 * 1000, result.id);
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
      var activePayment = getActivePayment(paymentsArr);
      if(!activePayment.watched && Number(activePayment.amount_paid) === 0) {
        resetPayment(activePayment, expectedAmount, cb);
        return;
      }
    }
    bitcoinUtil.getPaymentAddress(function(err, info) {
      if (err) {
        return cb(err, null);
      }
      else {
        insertPayment(invoiceId, info.result, expectedAmount, cb);
      }
    });
  });
};

// ===============================================
// Updating Payments with Transaction Data
// ===============================================

function validateTransactionBlock(payment, transaction, cb) {
  if (transaction.blockhash) {
    api.getBlock(transaction.blockhash, function(err, block) {
      if (err) {
        return cb(err, false, false);
      }
      var blockIsValid = validate.block(block);
      // Block is invalid and payment and transaction blockhash match
      var isReorg = !blockIsValid && payment.block_hash === transaction.blockhash;
      // Incoming block is valid and payment and transaction hash both are populated but dont match
      var blockHashChanged = blockIsValid && payment.block_hash && transaction.blockhash && payment.block_hash !== transaction.blockhash;
      // Block isnt valid and payment.block_hash === transaction.blockhash.
      return cb(null, blockIsValid, isReorg || blockHashChanged);
    });
  }
  else if (!transaction.blockhash && payment.block_hash) { // Reorg
    // No tx blockhash but payment used to have one. Indicates reorg.
    return cb(null, false, true);
  }
  else { // If transaction doesnt have blockhash it is initial notification
    return cb(null, true, false);
  }
}

var processReorgedPayment = function(payment, blockHash) {
  payment.block_hash = null;
  var reorgHistory = payment.reorg_history ? payment.reorg_history : [];
  if (!lodash.contains(reorgHistory, blockHash)) {
    reorgHistory.push(blockHash);
  }
  payment.reorg_history = reorgHistory;
  payment.status = 'pending'; // set status back to pending
};

var processReorgedPayments = function (blockHash) {
  db.getPaymentByBlockHash(blockHash, function(err, paymentsArr) {
    if (err) {
      return console.log(err);
    }
    if (paymentsArr) {
      paymentsArr.forEach(function (payment) {
        processReorgedPayment(payment, blockHash);
        db.insert(payment);
      });
    }
  });
};

var processReorgAndCheckDoubleSpent = function (transaction, blockHash, cb) {
  if (transaction.txid && transaction.walletconflicts.length > 0) {
    db.findPaymentByTxId(transaction.txid, function(err, payment) {
      if (err) {
        return cb ? cb(err) : null;
      }
      //TODO: Notify Admin of Double Spend
      payment.double_spent_history = transaction.walletconflicts;
      processReorgedPayment(payment, blockHash);
      db.insert(payment, cb);
    });
  }
};

// Updates payment with transaction data from listsinceblock or walletnotify
function updatePaymentWithTransaction(payment, transaction, cb) {
  db.findInvoice(payment.invoice_id, function(err, invoice) {
    if (err) {
      return cb(err);
    }
    validateTransactionBlock(payment, transaction, function(err, blockIsValid, isReorg) {
      if (err) {
        return cb(err);
      }
      var oldBlockHash = payment.block_hash;
      if (blockIsValid) {
        var curStatus = helper.getPaymentStatus(payment, transaction.confirmations, invoice);
        if(validate.paymentChanged(payment, transaction, curStatus)) {
          var amount = transaction.amount;
          payment.amount_paid = amount;
          payment.tx_id = transaction.txid;
          if (isReorg) {
            var reorgHistory = payment.reorg_history ? payment.reorg_history : [];
            if (!lodash.contains(reorgHistory, oldBlockHash)) {
              reorgHistory.push(oldBlockHash);
            }
            payment.reorgHistory = reorgHistory;
            if (transaction.txid && transaction.walletconflicts.length > 0) {
              payment.double_spent_history = transaction.walletconflicts;
            }
          }
          payment.block_hash = transaction.blockhash ? transaction.blockhash : null;
          payment.paid_timestamp = transaction.time * 1000;
          if (payment.status === 'unpaid') {
            payment.watched = true;
          }
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
          payment.status = helper.getPaymentStatus(payment, transaction.confirmations, invoice);
          db.insert(payment, function (err) {
            if (isReorg) {
              processReorgedPayments(oldBlockHash);
            }
            return cb(err);
          });
        }
        else {
          var error = new Error('No changes to update.');
          return cb(error);
        }
      }
      else if (isReorg) {
        // Check for doublespend
        processReorgAndCheckDoubleSpent(transaction, payment.block_hash, function(err) {
          if (err) {
            return cb(err);
          }
          // If no double spend process reorg for all payments with block hash
          processReorgedPayments(payment.block_hash);
        });
      }
    });
  });
}

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
        var totalPaid = new BigNumber(getTotalPaid(invoice, paymentsArr));
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
          invoice_id: invoiceId,
          address: transaction.address,
          amount_paid: Number(transaction.amount),
          expected_amount: Number(remainingBalance),
          block_hash: transaction.blockhash ? transaction.blockhash : null,
          spot_rate: Number(rate.valueOf()), // Exchange rate at time of payment
          created: new Date().getTime(),
          paid_timestamp: paidTime,
          tx_id: transaction.txid, // Bitcoind txid for transaction
          watched: true,
          type: 'payment'
        };
        payment.status = helper.getPaymentStatus(payment, transaction.confirmations, invoice);
        db.insert(payment, cb);
      }
      else {
        return cb(err);
      }
    });
  });
}

// Updates payment with walletnotify data
var updatePayment = function(transaction, cb) {
  db.findPaymentByTxId(transaction.txid, function(err, payment) {
    if (!err && payment) {
      // Updating confirmations of a watched payment
      updatePaymentWithTransaction(payment, transaction, cb);
    }
    else {
      // look up payment by address, should al
      db.findPayments(transaction.address, function(err, paymentsArr) {
        if (err || !paymentsArr) {
          return cb(err, undefined);
        }
        var invoiceId = null;
        paymentsArr.forEach(function(payment) {
          if (!payment.tx_id) {
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
  calculateLineTotals: calculateLineTotals,
  getTotalPaid: getTotalPaid,
  getActivePayment: getActivePayment,
  calculateRemainingBalance: calculateRemainingBalance,
  createNewPayment: createNewPayment,
  getPaymentHistory: getPaymentHistory,
  updatePayment: updatePayment,
  processReorgedPayment: processReorgedPayment,
  processReorgedPayments: processReorgedPayments,
  processReorgAndCheckDoubleSpent: processReorgAndCheckDoubleSpent
};

