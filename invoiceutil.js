var helper = require('./helper');
var validate = require('./validate');
var BigNumber = require('bignumber.js');
var bitstamped = require('bitstamped');
var bitcoinUtil = require('./bitcoinutil');
var config = require('./config');
var db = require('./db');

function getSavedAddress(invoiceId, cb) {
  db.findSavedAddress(invoiceId, function(err, savedAddressObj) {
    if (!err && savedAddressObj) {
      console.log('found');
      db.deleteDoc(savedAddressObj, function(err) {
        if (err) { return cb(err, null); }
        return cb(null, savedAddressObj.address);
      });
    }
    else {
      console.log('not found');
      return cb(err, null);
    }
  });
}

function insertPayment(invoiceId, address, expectedAmount, cb) {
  var curTime = new Date().getTime();
  bitstamped.getTicker(curTime, function(err, docs) {
    if (!err && docs.rows && docs.rows.length > 0) {
      var tickerData = docs.rows[0].value; // Get ticker object
      var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price      
      var payment = {};
      payment.invoice_id = invoiceId;
      payment.address = address;
      payment.amount_paid = 0; // Always stored in BTC
      payment.expected_amount = expectedAmount; // TODO: populate this
      payment.block_hash = null;
      payment.spot_rate = rate; // Exchange rate at time of payment TODO: populate this
      payment.status = 'unpaid';
      payment.created = new Date().getTime();
      payment.paid_timestamp = null;
      payment.tx_id = null; // Bitcoind txid for transaction
      payment.ntx_id = null; // Normalized txId
      payment.watched = true;
      payment.type = 'payment';

      db.insert(payment, function(err) {
        if (err) { return cb(err, null); }
        else { return cb(null, payment); }
      });
    }
    else {
      return cb(err, null);
    }
  });
}

var updatePaymentWithTransaction = function (payment, transaction, isWalletNotify, cb) {
  db.findInvoice(payment.invoice_id, function(err, invoice) {
    if (err) { return cb(err, undefined); }
    var newStatus = helper.getPaymentStatus(payment, transaction.confirmations, invoice);
    if(validate.paymentChanged(payment, transaction, newStatus, isWalletNotify)) {
      var amount = isWalletNotify ? helper.getReceiveDetail(transaction.details).amount : transaction.amount;
      payment.amount_paid = amount;
      payment.tx_id = transaction.txid;
      payment.ntx_id = transaction.normtxid;
      payment.block_hash = transaction.blockhash ? transaction.blockhash : null;
      payment.paid_timestamp = transaction.time * 1000;
      payment.status = newStatus;

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

      db.insert(payment, cb);
    }
    else {
      var error = new Error('No changes to update');
      cb(error, undefined);
    }
  });
};

// Handles case where user sends multiple payments to same address
var createNewPaymentWithTransaction = function(invoiceId, transaction, isWalletNotify, cb) {
  // TODO: Transaction time from bitcoind is not garunteed to be accurate
  var paidTime = transaction.time * 1000;
  db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
    if (err) { return cb(err, undefined); }
    bitstamped.getTicker(paidTime, function(err, docs) {
      if (!err && docs.rows && docs.rows.length > 0) {
        var tickerData = docs.rows[0].value;
        var rate = new BigNumber(tickerData.vwap); // Bitcoin volume weighted average price
        
        // Transactions from wallet notify are different from transactions from listsinceblock
        // Wallet Notify tx's have a details array listsince block tx's dont.
        var receiveDetail = isWalletNotify ? helper.getReceiveDetail(transaction.details) : transaction;
        var totalPaid = new BigNumber(getTotalPaid(invoice, paymentsArr));
        var remainingBalance = new BigNumber(invoice.balance_due).minus(totalPaid);
        console.log('before: ' + remainingBalance);
        var isUSD = invoice.currency.toUpperCase() === 'USD';
        if (isUSD) {

          var actualPaid = helper.roundToDecimal(rate.times(receiveDetail.amount).valueOf(), 2);
          var closeEnough = new BigNumber(actualPaid).equals(helper.roundToDecimal(remainingBalance, 2));
          if (closeEnough) {
            console.log('1');
            remainingBalance = receiveDetail.amount;
          }
          else {
            console.log('2');
            remainingBalance = Number(remainingBalance.dividedBy(rate).valueOf());
          }
        }
        remainingBalance = helper.roundToDecimal(remainingBalance, 8);
        console.log('after: ' + remainingBalance);

        var payment = {};
        payment.invoice_id = invoiceId;
        payment.address = receiveDetail.address;
        payment.amount_paid = Number(receiveDetail.amount);
        payment.expected_amount = Number(remainingBalance); // overpaid status by default
        payment.block_hash = transaction.blockhash ? transaction.blockhash : null;
        // payment.height = null; //TODO: Calculate and store or query using blockhash?
        payment.spot_rate = Number(rate.valueOf()); // Exchange rate at time of payment
        payment.status = helper.getPaymentStatus(payment, transaction.confirmations, invoice);
        payment.created = new Date().getTime();
        payment.paid_timestamp = paidTime;
        payment.tx_id = transaction.txid; // Bitcoind txid for transaction
        payment.ntx_id = transaction.normtxid; // Normalized txId
        payment.watched = true;
        payment.type = 'payment';

        db.insert(payment, cb);
      }
      else { return cb(err, undefined); }
    });
  });
};

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
  var totalPaid = new BigNumber(getTotalPaid(invoice, paymentsArr));
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
      else { return cb(err, undefined); }
    });
  }
  else { return cb(null, Number(remainingBalance.valueOf())); }
};

// Creates a new payment object associated with invoice
var createNewPayment = function(invoiceId, expectedAmount, cb) {
  getSavedAddress(invoiceId, function(err, address) {
    if (!err && address) {
      console.log('found address');
      insertPayment(invoiceId, address, expectedAmount, cb);
    }
    else {
      console.log('generating new address');
      bitcoinUtil.getPaymentAddress(function(err, info) { // Get payment address from bitcond
        if (err) { return cb(err, undefined); }
        else {
          console.log(info);
          insertPayment(invoiceId, info.result, expectedAmount, cb);
        }
      });
    }
  });
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

// Updates payment with walletnotify data
var updatePayment = function(transaction, cb) {
  var receiveDetail = helper.getReceiveDetail(transaction.details);
  if (!receiveDetail) {
   return cb('Wallet notify contained no relevant payment data.', undefined);
  }
  var address = receiveDetail.address;
  var ntxId = transaction.normtxid;
  db.findPaymentByNormalizedTxId(ntxId, function(err, payment) {
    if (!err && payment) {
      console.log('Updating watched Payment');
      // Updating confirmations of a watched payment
      updatePaymentWithTransaction(payment, transaction, true, cb);
    }
    else {
      db.findPayment(address, function(err, payment) {
        if (err || !payment) { return cb(err, undefined); }
        if (!err && !payment.ntx_id) {
          // Initial update from walletnotify
          console.log('Creating watched Payment');
          updatePaymentWithTransaction(payment, transaction, true, cb);
        }
        else if (!err && payment.ntx_id) {
          // Create new payment for same invoice as pre-existing payment
          console.log('Creating duplicate watched Payment');
          createNewPaymentWithTransaction(payment.invoice_id, transaction, true, cb);
        }
      });
    }
  });
};

var storeAddressForReuse = function(invoiceId, address) {
  var savedAddress = {
    invoice_id: invoiceId,
    address: address,
    type: 'address'
  };
  db.insert(savedAddress);
};

module.exports = {
  calculateLineTotals: calculateLineTotals,
  getTotalPaid: getTotalPaid,
  getActivePayment: getActivePayment,
  calculateRemainingBalance: calculateRemainingBalance,
  createNewPayment: createNewPayment,
  getPaymentHistory: getPaymentHistory,
  updatePayment: updatePayment,
  createNewPaymentWithTransaction: createNewPaymentWithTransaction,
  updatePaymentWithTransaction: updatePaymentWithTransaction,
  storeAddressForReuse: storeAddressForReuse
};

