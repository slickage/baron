var helper = require('./helper');
var bitstamped = require('bitstamped');
var bitcoinUtil = require('./bitcoinutil');
var btcAddr = require('bitcoin-address');
var db = require('./db');

function getPaymentStatus(payment, minConfirmations, remainingBalance) {
  var status = payment.status;
  var confirmationsMet = payment.confirmations === minConfirmations;
  console.log('PAYMENT STATUS DATA: ');
  console.log('Status: ' + status);
  console.log('Payment Confirmations: ' + payment.confirmations);
  console.log('Min Confirmations: ' + minConfirmations);
  console.log('Remaining Balance: ' + remainingBalance);
  console.log('Payment Obj: ' + JSON.stringify(payment));

  if (payment.amount_paid > 0 && !confirmationsMet) {
    status = 'pending';
  }
  else if (confirmationsMet) {
    if(remainingBalance === 0) {
      status = 'paid';
    }
    else if (remainingBalance > 0) {
      status = 'partial';
    }
    else if (remainingBalance < 0) {
      status = 'overpaid';
    }
  }
  console.log(status);
  return status;
}

// TODO:
// Currently assuming there is only one detail with the category receive
// Possible that this will change
function getReceiveDetail(details) {
  var receiveDetail;
  details.forEach(function(detail) {
    if(detail.category === 'receive') {
      receiveDetail = detail;
    }
  });
  return receiveDetail;
}

// Case 1: Found payment by ntx_id so were just updating confirmations
function updateConfirmations(payment, transaction, cb) {
    db.findInvoiceAndPayments(payment.invoice_id, function(err, invoice, paymentsArr) {
    if (!err) {
      calculateRemainingBalance(invoice, paymentsArr, function(err, remainingBalance) {
        if (!err) {
          // Update confirmations and status
          payment.confirmations = transaction.confirmations;
          payment.status = getPaymentStatus(payment, invoice.min_confirmations, remainingBalance);
          console.log('Updating Confirmations: ' + JSON.stringify(payment));

          // Update payment stored in couch
          db.update(payment, function(err, doc) {
            return cb(err, doc);
          });
        }
        return cb(err, undefined);
      });
    }
    return cb(err, undefined);
  });
}

// Case 2: Found payment by address and ntx_id wasnt populated yet. This is the
// first walletnotify for this payment object.
function initialPaymentUpdate(payment, transaction, cb) {
    db.findInvoiceAndPayments(payment.invoice_id, function(err, invoice, paymentsArr) {
    if (!err) {
      calculateRemainingBalance(invoice, paymentsArr, function(err, remainingBalance) {
        if (!err) {
          // Update payment object
          payment.amount_paid = transaction.amount;
          payment.confirmations = transaction.confirmations;
          payment.tx_id = transaction.txid;
          payment.ntx_id = transaction.normtxid;
          payment.paid_timestamp = transaction.time * 1000;
          // Subtract transaction.amount from remainingBalance, since calculateRemainingBalance
          // isn't aware of the incoming payment amount           
          payment.status = getPaymentStatus(payment, invoice.min_confirmations, remainingBalance - transaction.amount);
          console.log('Initial Payment Walletnotify: ' +  JSON.stringify(payment));

          // Update payment stored in couch
          db.update(payment, cb);
        }
        return cb(err, undefined);
      });
    }
    return cb(err, undefined);
  });
}

// Case 3: Found payment by address and ntx_id is populated, this means someone 
// sent another payment to a preexisting payment address. We need to create a new payment 
// object with the same address. Two paymment objects will now have the same address,
// but different ntx_id's
function createNewPaymentWithTransaction(invoiceId, transaction, cb) {
  var paidTime = transaction.time * 1000;
  db.findInvoiceAndPayments(invoiceId, function(err, invoice, paymentsArr) {
    if (!err) {
      calculateRemainingBalance(invoice, paymentsArr, function(err, remainingBalance) {
        if (!err) {
          bitstamped.getTicker(paidTime, function(err, docs) {
            if (!err && docs.rows && docs.rows.length > 0) {
              var tickerData = docs.rows[0].value; // Get ticker object
              var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price

              // Create payment object
              var payment = {};
              payment.invoice_id = invoiceId;
              payment.address = getReceiveDetail(transaction.details).address;
              payment.amount_paid = transaction.amount; // Always stored in BTC
              payment.confirmations = transaction.confirmations;
              payment.spot_rate = rate; // Exchange rate at time of payment
              // Subtract transaction.amount from remainingBalance, since calculateRemainingBalance
              // isn't aware of the incoming payment amount 
              payment.status = getPaymentStatus(payment, invoice.min_confirmations, remainingBalance - transaction.amount);
              payment.created = new Date().getTime();
              payment.paid_timestamp = paidTime;
              payment.tx_id = transaction.txid; // Bitcoind txid for transaction
              payment.ntx_id = transaction.normtxid; // Normalized txId
              payment.type = 'payment';

              console.log('Creating Duplicate Address Payment: ' +  JSON.stringify(payment));

              // Add payment object to database
              db.createPayment(payment, cb);
            }
            return cb(err, undefined);
          });
        }
        return cb(err, undefined);
      });
    }
    return cb(err, undefined);
  });
}

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
        remainingBalance = helper.roundToDecimal(remainingBalance / rate, 8);
      }
      return cb(err, remainingBalance);
    });
  }
  else {
    return cb(null, remainingBalance);
  }
};

var createNewPayment = function(invoiceId, cb) {
  bitcoinUtil.getPaymentAddress(function(err, address) { // Get payment address from bitcond
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
    payment.confirmations = null;
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

var updatePayment = function(transaction, cb) {
  var address = getReceiveDetail(transaction.details).address;
  var ntxId = transaction.normtxid;
  // Try to look up by ntx_id first, if we find a match we are just
  // updating that existing payments confirmations
  db.findPaymentByNormalizedTxId(ntxId, function(err, payment) {
    if (!err && payment) { // found match for ntx_id
      // Updating confirmations of an existing payment
      updateConfirmations(payment, transaction, cb);
    }
    else { // No match found, try looking up by address
      db.findPayment(address, function(err, payment) {
        // If payment object doesnt have ntx_id populated that means it exists
        // but has not been updated by a walletnotify before
        if (!err && !payment.ntx_id) {
          // Initial update from walletnotify
          initialPaymentUpdate(payment, transaction, cb);
        }
        // If payment object with same address exists, but does have 
        // ntx_id populated that means it exists and is already being 
        // monitored by wallet notify. So this is a new transaction
        // using the same payment address. Create new payment
        else if (!err && payment.ntx_id) { // Payment exists and already has ntx so we need to create new payment
          // Create new payment for same invoice as pre-existing payment
          createNewPaymentWithTransaction(payment.invoice_id, transaction, cb);
        }
        return cb(err, undefined);
      });
    }
  });
};

var updateSpotRate = function(payment, cb) {
  var status = payment.status;
  if (status === 'paid' || status === 'overpaid' || status === 'partial') { return; }
  var curTime = new Date().getTime();
  bitstamped.getTicker(curTime, function(err, docs) {
    if (!err && docs.rows && docs.rows.length > 0) {
      var tickerData = docs.rows[0].value; // Get ticker object
      var rate = Number(tickerData.vwap); // Bitcoin volume weighted average price

      // Update payment spot rate then save
      payment.spot_rate = rate;
      db.update(payment, function(err, doc) {
        return cb(err, doc);
      });
    }
    return cb(err, undefined);
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
  updateSpotRate: updateSpotRate
};

