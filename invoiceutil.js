var helper = require('./helper');
var bitstamped = require('bitstamped');
var payments = require('./payments');
var btcAddr = require('bitcoin-address');
var db = require('./db');

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

var getActivePayment = function(paymentsArr) {
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
};

var getTotalPaid = function(paymentsArr, convert) {
  var totalPaid = 0;
  paymentsArr.forEach(function(payment) {
      var paidAmount = payment.amount_paid;
      if (paidAmount) {
        // If invoice is in USD then we must multiply the amount paid (BTC) by the spot rate (USD)
        totalPaid += convert ? paidAmount * payment.spot_rate : paidAmount;
      }
  });
  return convert ? helper.roundToDecimal(totalPaid, 2) : totalPaid;
};

var calculateRemainingBalance = function(invoice, paymentsArr, cb) {
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
};

var createNewPayment = function(invoiceId, cb) {
  payments.getPaymentAddress(function(err, address) { // Get payment address from bitcond
    if (err) {
      return cb(err, undefined);
    }
    else if (!btcAddr.validate(address, 'testnet')) {
      return cb('Cannot generate valid payment address.', undefined);
    }
    // Create payment object
    var payment = {};
    payment.invoice_id = invoiceId;
    payment.address = address;
    payment.amount_paid = 0; // Always stored in BTC
    payment.spot_rate = null; // Exchange rate at time of payment
    payment.status = 'unpaid';
    payment.created = new Date().getTime();
    payment.paid_timestamp = null;
    payment.tx_id = null; // Bitcoind txid for transaction
    payment.ntx_id = null; // Normalized txId
    payment.type = 'payment';

    // Add payment object to database
    db.createPayment(payment, cb);
    
  });
};

var getPaymentHistory = function(paymentsArr) {
  var history = [];
  paymentsArr.forEach(function(payment) {
    var status = payment.status;
    // Only show history of paid payments
    if(status.toLowerCase() !== 'unpaid') {
      history.push(payment);
    }
    // Capitalizing first letter of payment status for display in invoice view
    payment.status = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  });
  return history;
};

module.exports = {
  calculateLineTotals: calculateLineTotals,
  getTotalPaid: getTotalPaid,
  getActivePayment: getActivePayment,
  calculateRemainingBalance: calculateRemainingBalance,
  createNewPayment: createNewPayment,
  getPaymentHistory: getPaymentHistory
};

