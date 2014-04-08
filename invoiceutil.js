var helper = require('./helper');
var bitstamped = require('bitstamped');
var bitcoinUtil = require('./bitcoinutil');
var db = require('./db');

// Updates confirmations of an already tracked payment
function updateConfirmations(payment, transaction, cb) {
  db.findInvoice(payment.invoice_id, function(err, invoice) {
    if (err) { return cb(err, undefined); }
    payment.confirmations = transaction.confirmations;
    payment.status = helper.getPaymentStatus(payment, invoice.min_confirmations);

    db.insert(payment, cb);
  });
}

// Intial walletnotify for payment
function initialPaymentUpdate(payment, transaction, cb) {
  db.findInvoice(payment.invoice_id, function(err, invoice) {
    if (err) { return cb(err, undefined); }
    payment.amount_paid = transaction.amount;
    payment.confirmations = transaction.confirmations;
    payment.tx_id = transaction.txid;
    payment.ntx_id = transaction.normtxid;
    payment.paid_timestamp = transaction.time * 1000;
    payment.status = helper.getPaymentStatus(payment, invoice.min_confirmations);

    db.insert(payment, cb);
});
}

// Handles case where user sends multiple payments to same address
function createNewPaymentWithTransaction(invoiceId, transaction, cb) {
  // TODO: Transaction time from bitcoind is not garunteed to be accurate
  var paidTime = transaction.time * 1000;
  db.findInvoice(invoiceId, function(err, invoice) {
    if (err) { return cb(err, undefined); }
    bitstamped.getTicker(paidTime, function(err, docs) {
      if (!err && docs.rows && docs.rows.length > 0) {
        var tickerData = docs.rows[0].value; 
        var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price
        var payment = {};
  
        payment.invoice_id = invoiceId;
        payment.address = helper.getReceiveDetail(transaction.details).address;
        payment.amount_paid = transaction.amount;
        // TODO: How should we treat the status of these types of payments
        payment.expected_amount = 0; // overpaid status by default
        payment.confirmations = transaction.confirmations;
        payment.spot_rate = rate; // Exchange rate at time of payment
        payment.status = helper.getPaymentStatus(payment, invoice.min_confirmations);
        payment.created = new Date().getTime();
        payment.paid_timestamp = paidTime;
        payment.tx_id = transaction.txid; // Bitcoind txid for transaction
        payment.ntx_id = transaction.normtxid; // Normalized txId
        payment.type = 'payment';

        db.insert(payment, cb);
      }
      else { return cb(err, undefined); }
    });
  });
}

// Calculates line totals for invoice line items
var calculateLineTotals = function(invoice) {
  var isUSD = invoice.currency.toUpperCase() === 'USD';
  invoice.line_items.forEach(function (item){
    item.line_total = item.amount * item.quantity;
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
  var totalPaid = 0;
  paymentsArr.forEach(function(payment) {
    var paidAmount = payment.amount_paid;
    if (paidAmount) {
      // If invoice is in USD then we must multiply the amount paid (BTC) by the spot rate (USD)
      totalPaid += isUSD ? paidAmount * payment.spot_rate : paidAmount;
    }
  });
  if (isUSD) {
    // If were dealing in fiat and the calculated total is within 10 cents consider it paid
    if (Math.abs(invoice.balance_due - totalPaid) < 0.1) {
      totalPaid = helper.roundToDecimal(invoice.balance_due, 2);
    }
    else {
      totalPaid = helper.roundToDecimal(totalPaid, 2);
    }
  }
  return totalPaid;
};

// Calculates the invoice's remaining balance
var calculateRemainingBalance = function(invoice, paymentsArr, cb) {
  var isUSD = invoice.currency.toUpperCase() === 'USD';
  var totalPaid = getTotalPaid(invoice, paymentsArr);
  var remainingBalance = invoice.balance_due - totalPaid;
  if (isUSD) {
    remainingBalance = helper.roundToDecimal(remainingBalance, 2); // Round to 2 places for USD
    var curTime = new Date().getTime();
    bitstamped.getTicker(curTime, function(err, docs) {
      if (!err && docs.rows && docs.rows.length > 0) {
        var tickerData = docs.rows[0].value; // Get ticker object
        var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price
        remainingBalance = helper.roundToDecimal(remainingBalance / rate, 8);
        return cb(null, remainingBalance);
      }
      else { return cb(err, undefined); }
    });
  }
  else { return cb(null, remainingBalance); }
};

// Creates a new payment object associated with invoice
var createNewPayment = function(invoiceId, cb) {
  bitcoinUtil.getPaymentAddress(function(err, info) { // Get payment address from bitcond
    if (err) { return cb(err, undefined); }
    var address = info.result;
    var payment = {};
    payment.invoice_id = invoiceId;
    payment.address = address;
    payment.amount_paid = 0; // Always stored in BTC
    payment.expected_amount = null;
    payment.confirmations = null;
    payment.spot_rate = null; // Exchange rate at time of payment
    payment.status = 'unpaid';
    payment.created = new Date().getTime();
    payment.paid_timestamp = null;
    payment.tx_id = null; // Bitcoind txid for transaction
    payment.ntx_id = null; // Normalized txId
    payment.type = 'payment';

    db.insert(payment, cb);
  });
};

// Returns array of payments that are not in unpaid status
var getPaymentHistory = function(paymentsArr) {
  var history = [];
  paymentsArr.forEach(function(payment) {
    var status = payment.status;
    if(status.toLowerCase() !== 'unpaid') {
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
      // Updating confirmations of a watched payment
      updateConfirmations(payment, transaction, cb);
    }
    else {
      db.findPayment(address, function(err, payment) {
        if (err) { return cb(err, undefined); }
        if (!err && !payment.ntx_id) {
          // Initial update from walletnotify
          initialPaymentUpdate(payment, transaction, cb);
        }
        else if (!err && payment.ntx_id) {
          // Create new payment for same invoice as pre-existing payment
          createNewPaymentWithTransaction(payment.invoice_id, transaction, cb);
        }
      });
    }
  });
};

// Updates spot rate and expected amount for payment
var refreshPaymentData = function(payment, remainingBalance, cb) {
  var status = payment.status;
  if (status === 'paid' || status === 'overpaid' || status === 'partial') { return; }
  var curTime = new Date().getTime();
  bitstamped.getTicker(curTime, function(err, docs) {
    if (!err && docs.rows && docs.rows.length > 0) {
      var tickerData = docs.rows[0].value; // Get ticker object
      var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price

      payment.spot_rate = rate;
      payment.expected_amount = remainingBalance;
      db.insert(payment, cb);
    }
    else { return cb(err, undefined); }
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
  refreshPaymentData: refreshPaymentData
};

