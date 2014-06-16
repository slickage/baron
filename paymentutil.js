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
        return;
      }
    }
    bitcoinUtil.getNewAddress(function(err, info) {
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
    bitcoinUtil.getBlock(transaction.blockhash, function(err, block) {
      if (err) {
        return cb(err, false, false);
      }
      block = block.result;
      var blockIsValid = validate.block(block);
      // Block is invalid and payment and transaction blockhash match
      var isReorg = !blockIsValid && payment.block_hash === transaction.blockhash;
      // Incoming block is valid and payment and transaction hash both are populated but dont match
      var blockHashChanged = (blockIsValid && Boolean(payment.block_hash) && Boolean(transaction.blockhash) && (payment.block_hash !== transaction.blockhash));
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
  if (blockHash) {
    var reorgHistory = payment.reorg_history ? payment.reorg_history : [];
    if (!_.contains(reorgHistory, blockHash)) {
      reorgHistory.push(blockHash);
    }
    payment.reorg_history = reorgHistory;
  }
  if (payment.confirmations === -1) {
    payment.status = 'invalid';
    payment.watched = false;
  }
  else { // if confirmations arent -1 could be reorged back in
    payment.status = 'pending';
  }
};

var processReorgedPayments = function (blockHash) {
  db.getPaymentByBlockHash(blockHash, function(err, paymentsArr) {
    if (err) {
      return console.log(err);
    }
    if (paymentsArr) {
      paymentsArr.forEach(function (payment) {
        var origStatus = payment.status;
        processReorgedPayment(payment, blockHash);
        db.insert(payment, function(err) {
          if (!err) {
            invoiceWebhooks.determineWebhookCall(payment.invoice_id, origStatus, payment.status);
          }
        });
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
      var origStatus = payment.status;
      //TODO: Notify Admin of Double Spend
      if (transaction.walletconflicts.length > 0) {
        payment.double_spent_history = transaction.walletconflicts;
      }
      if (blockHash) {
        processReorgedPayment(payment, blockHash);
      }
      db.insert(payment, function(err) {
        if (err) {
          cb(err);
        }
        else {
          invoiceWebhooks.determineWebhookCall(payment.invoice_id, origStatus, payment.status);
          cb();
        }
      });
    });
  }
};

// Updates payment with transaction data from listsinceblock or walletnotify
var updatePaymentWithTransaction = function(payment, transaction, cb) {
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
        var origStatus = payment.status;
        var newConfirmations = transaction.confirmations;
        var curStatus = helper.getPaymentStatus(payment, newConfirmations, invoice);
        if(validate.paymentChanged(payment, transaction, curStatus)) {
          if (isReorg) { // Handle Reorg History.
            var reorgHistory = payment.reorg_history ? payment.reorg_history : [];
            if (!_.contains(reorgHistory, oldBlockHash)) {
              reorgHistory.push(oldBlockHash);
            }
            payment.reorgHistory = reorgHistory;
          }
          if (transaction.walletconflicts.length > 0) { // Handle Double Spent History.
            payment.double_spent_history = transaction.walletconflicts;
          }
          var amount = transaction.amount;
          payment.amount_paid = amount;
          payment.tx_id = transaction.txid;
          payment.block_hash = transaction.blockhash ? transaction.blockhash : null;
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
          // Update status after updating amounts to see if it changed.
          payment.status = helper.getPaymentStatus(payment, newConfirmations, invoice);
          db.insert(payment, function (err) {
            if (err && err.error === 'conflict' ) {
              console.log('updatePaymentWithTransaction: Document update conflict: ' + require('util').inspect(err.request.body));
              //console.log(err);
              return cb();
            }
            else if (isReorg) {
              processReorgedPayments(oldBlockHash);
            }
            else if (!err) {
              invoiceWebhooks.determineWebhookCall(payment.invoice_id, origStatus, payment.status);
            }
            return cb(err);
          });
        }
        else {
          return cb();
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
          block_hash: transaction.blockhash ? transaction.blockhash : null,
          spot_rate: Number(rate.valueOf()), // Exchange rate at time of payment
          created: new Date().getTime(),
          paid_timestamp: paidTime,
          tx_id: transaction.txid, // Bitcoind txid for transaction
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
            if (curPayment.tx_id === latestConflictingTx) {
              payment.expected_amount = curPayment.expected_amount;
              payment.spot_rate = curPayment.spot_rate;
            }
          });
        }
        db.insert(payment, function(err) {
          if (err && err.error === 'conflict' ) {
            console.log('createNewPaymentWithTransaction: Document update conflict: ' + require('util').inspect(err.request.body));
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

// Updates payment with walletnotify data
var updatePayment = function(transaction, cb) {
  if (!transaction.txid || !transaction.address || transaction.amount < 0) {
    var error = new Error('Ignoring irrelevant transaction.');
    return cb(error, null);
  }
  db.findPaymentByTxId(transaction.txid, function(err, payment) {
    if (!err && payment) {
      // Updating confirmations of a watched payment
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
  createNewPayment: createNewPayment,
  updatePayment: updatePayment,
  updatePaymentWithTransaction: updatePaymentWithTransaction,
  processReorgedPayment: processReorgedPayment,
  processReorgedPayments: processReorgedPayments,
  processReorgAndCheckDoubleSpent: processReorgAndCheckDoubleSpent
};

