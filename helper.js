var BigNumber = require('bignumber.js');
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

// TODO:
// Currently assuming there is only one detail with the category receive
// Possible that this will change
var getReceiveDetail = function(details) {
  var receiveDetail;
  details.forEach(function(detail) {
    if(detail.category === 'receive') {
      receiveDetail = detail;
    }
  });
  return receiveDetail;
};

// Returns status of payment
var getPaymentStatus = function(payment, confirmations, invoice) {
  confirmations = confirmations ? confirmations : 0; // Pending if there are no confs
  var minConfirmations = invoice.min_confirmations;
  var status = payment.status;
  var confirmationsMet = Number(confirmations) >= Number(minConfirmations);
  var expectedAmount = new BigNumber(payment.expected_amount);
  var amountPaid = new BigNumber(payment.amount_paid);
  if (amountPaid.greaterThan(0) && !confirmationsMet) {
    status = 'pending';
  }
  else if (confirmationsMet) {
    if(amountPaid.equals(expectedAmount)) {
      if (status !== 'paid') {
        // Webhook here
        status = 'paid';
      }
    }
    else if (amountPaid.lessThan(expectedAmount)) {
      status = 'partial';
    }
    else if (amountPaid.greaterThan(expectedAmount)) {
      status = 'overpaid';
    }
  }
  return status;
};

module.exports = {
  decimalPlaces: decimalPlaces,
  toFourDecimals: toFourDecimals,
  getLastFourDecimals: getLastFourDecimals,
  roundToDecimal: roundToDecimal,
  getReceiveDetail: getReceiveDetail,
  getPaymentStatus: getPaymentStatus
};