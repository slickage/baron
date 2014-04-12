var config = require('./config');
var api = require('./insightapi');
var validate = require('./validate');
var bitcoinUtil = require('./bitcoinutil');
var invoiceUtil = require('./invoiceutil');
var db = require('./db');

// Stores initial "last block hash" if it doesnt exist returns it if it does
function getLastBlockHash(cb) {
  db.getLastKnownBlockHash(function(err, lastBlockHash) {
    if (err) { return cb(err, undefined); }
    if (lastBlockHash) { return cb(undefined, lastBlockHash); }
    else {
      api.getLastBlockHash(function (err, lastBlockHash) {
        if (err) { return cb(err, undefined); }
        db.insert(lastBlockHash, function(err, body) {
          if (err) { return cb(err, undefined); }
          return cb(undefined, lastBlockHash);
        });
      });
    }
  });
}

function updatePaymentWithTxData(payment, transaction) {
  // Check that the payment doesnt already contain the data
  if (payment.ntx_id !== transaction.normtxid) {
    payment.block_hash = transaction.blockhash;
    payment.ntx_id = transaction.normtxid;
    payment.tx_id = transaction.txid;
    db.insert(payment);
  }
}

function processPaymentsByNtxId(transactions) {
  transactions.forEach(function(transaction) {
    if (!transaction.normtxid || !transaction.address) { return console.log('Transaction missing ntxid or address'); }
    var ntxId = transaction.normtxid;
    var address = transaction.address;
    db.findPaymentByNormalizedTxId(ntxId, function(err, paymentByNtxId){
      if (err) { // Search by address to see if it's another payment to the same address
        // if we cant find by ntx look by address, maybe payment missed wallet notify
        db.findPayments(address, function(err, paymentsArr) { // Needs to find all payments at that address
          if (err) { return console.log('Error retrieving payments'); }
          var invoiceId = null;
          paymentsArr.forEach(function(payment) {
            // Look for payments where !payment.ntx_id if found update it
            if (!payment.ntx_id) { // If payment doesnt have ntxid then it hasn't been updated before
              // Update payment with transaction data
              updatePaymentWithTxData(payment, transaction);
            }
            else { // Payment already exists, this is a transaction to an already used address
              // set the invoice id so we know which invoice to create the new payment for
              invoiceId = payment.invoice_id;
            }
          });
          // Calling this outside forEach loop otherwise, it could possible generate duplicate payments.
          if (invoiceId) {
            invoiceUtil.createNewPaymentWithTransaction(invoiceId, transaction, false, function(err, body) {
              if (err) { return console.log('Error creating payment for txid: ' + transaction.txid); }
            });
          }
        });
      }
      // Found payment by ntx_id. Update payment data with tx data if necessary. Should this ever happen?! Reorg?
      else {
        updatePaymentWithTxData(paymentByNtxId, transaction);
      }
    });
  });
  
}

function processReorgedPayments(blockHash) {
  db.getPaymentByBlockHash(blockHash, function(err, paymentsArr) {
    if (err) { return console.log(err); }
    paymentsArr.forEach(function (payment) {
      payment.block_hash = null;
      // payment.height TODO
      db.insert(payment);
    });
  });
}

function processBlockHash(blockHashObj) {
  var blockHash = blockHashObj.hash;
  api.getBlock(blockHash, function(err, block) {
    if (err) { return console.log(err); }
    console.log('> Block Valid: ' + validate.block(block));
    // If valid get transactions since last block (bitcore)
    if (validate.block(block)) {
      // Get List Since Block 
      bitcoinUtil.listSinceBlock(blockHash, function (err, info) {
        if (err) { return console.log(err); }
        var transactions = info.result.transactions;
        var lastBlock = info.result.lastblock;
        console.log(transactions);
        console.log(lastBlock);
        // Query couch for existing payments by ntxid if found update
        processPaymentsByNtxId(transactions);
        if (blockHash !== lastBlock) {
          blockHashObj.hash = lastBlock; // update to latest block
          db.insert(blockHashObj); // insert updated last block into db
        }
      });
    }
    else { // If invalid update all transactions in block and step back
      // Update reorged transactions (set block_hash = null)
      processReorgedPayments(block.hash);
      // Recursively check previousHash
      blockHashObj.hash = block.previousblockhash;
      processBlockHash(blockHashObj);
    }
  });
}

function lastBlockJob() {
  // Get Last Block, create it if baron isnt aware of one.
  getLastBlockHash(function(err, lastBlockHashObj) {
    if (err) { return console.log(err); }
    console.log('Processing Last Block: ' + lastBlockHashObj);
    processBlockHash(lastBlockHashObj);
  });
}

var runLastBlockJob = function () {
  setInterval(function(){
    lastBlockJob();
  }, config.lastBlockJobInterval);
};

module.exports = {
  runLastBlockJob:runLastBlockJob,
};