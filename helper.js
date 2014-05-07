var BigNumber = require('bignumber.js');
var invoiceWebhooks = require(__dirname + '/invoicewebhooks');

// returns decimal places of provided
var decimalPlaces = function(number) {
  if(Math.floor(number) === number) {
    return 0;
  }
  return number.toString().split('.')[1].length || 0;
};

// Truncates a number to four decimal places 
var toFourDecimals = function(number) {
  number = Number(number).toFixed(8).toString();
  var numberArr = number.toString().split('.');
  return numberArr[0] + '.' + numberArr[1].substring(0, 4);
};

// Assuming number with 8 decimal places, returns last four digits
var getLastFourDecimals = function(number) {
  number = Number(number).toFixed(8).toString();
  return number.split('.')[1].substring(4, 8);
};

// Round to decimal place
var roundToDecimal = function(number, decimalPlaces) {
  var offset = Math.pow(10, decimalPlaces);
  return (Math.round(number * offset) / offset).toFixed(decimalPlaces);
};

// Returns receiveDetail portion of transaction json from wallet notify
var getReceiveDetail = function(details) {
  var receiveDetail;
  details.forEach(function(detail) {
    if(detail.category === 'receive') {
      receiveDetail = detail;
    }
  });
  return receiveDetail;
};

// Returns the difference in days, hours, mins, and secs between parameter
var getExpirationCountDown = function (expiration) {
  var curTime = new Date().getTime();
  var diff = expiration - curTime;
  var days = Math.floor(diff / 1000 / 60 / 60 / 24);
  diff -= days * 1000 * 60 * 60 * 24;
  var hours = Math.floor(diff / 1000 / 60 / 60);
  diff -= hours * 1000 * 60 * 60;
  var mins = Math.floor(diff / 1000 / 60);
  diff -= mins * 1000 * 60;
  var secs = Math.floor(diff / 1000);
  if (days === 0 && hours !== 0) {
    return hours + 'h ' + mins + 'm ' + secs + 's';
  }
  else if (days === 0 && hours === 0) {
    return mins + 'm ' + secs + 's';
  }
  else {
    return days + 'd ' + hours + 'h ' + mins + 'm ' + secs + 's';
  }
};

// Returns status of payment
var getPaymentStatus = function(payment, confirmations, invoice) {
  confirmations = confirmations ? confirmations : 0; // Pending if there are no confs
  var minConfirmations = invoice.min_confirmations;
  var status = payment.status;
  var origStatus = status;
  var confirmationsMet = Number(confirmations) >= Number(minConfirmations);
  var expectedAmount = new BigNumber(payment.expected_amount);
  var amountPaid = new BigNumber(payment.amount_paid);
  if (confirmations === -1) {
    status = 'invalid';
    invoiceWebhooks.queueInvalid(invoice.webhooks, invoice._id, origStatus, status);
  }
  else if (amountPaid.greaterThan(0) && !confirmationsMet) {
    status = 'pending';
    invoiceWebhooks.queuePending(invoice.webhooks, invoice._id, origStatus, status);
  }
  else if (confirmationsMet) {
    var isUSD = invoice.currency.toUpperCase() === 'USD';
    var closeEnough = false;
    if (isUSD) {
      var actualPaid = new BigNumber(payment.amount_paid).times(payment.spot_rate);
      var expectedPaid = new BigNumber(payment.expected_amount).times(payment.spot_rate);
      actualPaid = roundToDecimal(actualPaid.valueOf(), 2);
      expectedPaid = roundToDecimal(expectedPaid.valueOf(), 2);
      closeEnough = new BigNumber(actualPaid).equals(expectedPaid);
    }
    if(amountPaid.equals(expectedAmount) || closeEnough) {
      status = 'paid';
      invoiceWebhooks.queuePaid(invoice.webhooks, invoice._id, origStatus, status);
    }
    else if (amountPaid.lessThan(expectedAmount)) {
      status = 'partial';
      invoiceWebhooks.queuePartial(invoice.webhooks, invoice._id, origStatus, status);
    }
    else if (amountPaid.greaterThan(expectedAmount)) {
      status = 'overpaid';
      invoiceWebhooks.queuePaid(invoice.webhooks, invoice._id, origStatus, status);
    }
  }



  // Notify admin of invalid transaction
  if (status === 'invalid' && origStatus !== status) {
    // TODO: Notify Admin
  }
  return status;
};

module.exports = {
  decimalPlaces: decimalPlaces,
  toFourDecimals: toFourDecimals,
  getLastFourDecimals: getLastFourDecimals,
  roundToDecimal: roundToDecimal,
  getReceiveDetail: getReceiveDetail,
  getExpirationCountDown: getExpirationCountDown,
  getPaymentStatus: getPaymentStatus
};