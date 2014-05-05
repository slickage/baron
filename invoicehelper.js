var helper = require('./helper');
var BigNumber = require('bignumber.js');
var bitstamped = require('bitstamped');

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

// Returns the latest payment object for invoice
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
    if (payment.status.toLowerCase() === 'invalid') {
      return;
    }
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

// Calculates the invoice's amount due in its set currency
var getAmountDue = function(balanceDue, totalPaid, currency) {
  var isUSD = currency.toUpperCase() === 'USD';
  var amountDue = new BigNumber(balanceDue).minus(totalPaid);
  if (isUSD) {
    amountDue = helper.roundToDecimal(amountDue , 2);
  }
  else {
    amountDue = Number(amountDue);
    if (helper.decimalPlaces(amountDue) > 8) {
      amountDue = Number(helper.roundToDecimal(amountDue, 8));
    }
  }
  return amountDue;
};

// Calculates the invoice's amount due in BTC, for payments page
var getAmountDueBTC = function(invoice, paymentsArr, cb) {
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

// Returns array of payments that are not in unpaid status for invoice
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

module.exports = {
  calculateLineTotals: calculateLineTotals,
  getActivePayment: getActivePayment,
  getTotalPaid: getTotalPaid,
  getAmountDue: getAmountDue,
  getAmountDueBTC: getAmountDueBTC,
  getPaymentHistory: getPaymentHistory
};