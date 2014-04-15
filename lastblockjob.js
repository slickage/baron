var config = require('./config');
var api = require('./insightapi');
var validate = require('./validate');
var bitcoinUtil = require('./bitcoinutil');
var invoiceUtil = require('./invoiceutil');
var helper = require('./helper');
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
  console.log(payment);
  db.findInvoice(payment.invoice_id, function(err, invoice) {
    if (err) { console.log('Error retrieving invoice: ' + payment.invoice_id); }
    if (transaction.blockhash) {
      api.getBlock(transaction.blockhash, function(err, block) {
        if (err) {
          console.log('Error retrieving block: ' + transaction.blockhash);
        }
        if (validate.block(block)) {
          if (payment.ntx_id !== transaction.normtxid) { // Initial Payment Update
            invoiceUtil.initialPaymentUpdate(payment, transaction, false, function(err, result) {
              if (err) { console.log('Error Initializing Payment:' + payment.address); }
            });
          }
          else { // Updating Payments Status and block hash
            invoiceUtil.updatePaymentStatusAndBlockHash(payment, transaction, function(err, result) {
              if (err) { console.log('Error Updating Status and Blockhash for Payment:' + payment.ntx_id); }
            });
          }
        }
        // Block isnt valid and payment.block_hash === transaction.blockhash.
        else if (payment.block_hash === transaction.blockhash) {
          // Clear payments block_hash if it was storing the invalid one.
          payment.block_hash = null;
          // Transaction.confirmations should be 0 this should put payment back to pending
          // This is technically a reorg though. TODO.
          payment.status = helper.getPaymentStatus(payment, transaction.confirmations, invoice.min_confirmations);
          db.insert(payment);
        }
      });
    }
    else { // transaction is too new, no blockhash
      invoiceUtil.initialPaymentUpdate(payment, transaction, false, function(err, result) {
        if (err) { console.log('Error Initializing Payment:' + payment.ntx_id); 
        console.log(err);}
      });
    }
  });
}

function processPaymentsByNtxId(transactions) {
  transactions.forEach(function(transaction) {
    if (!transaction.normtxid || !transaction.address) { return console.log('Transaction missing ntxid or address'); }
    var ntxId = transaction.normtxid;
    var address = transaction.address;
    console.log('Searching for payment by: ' + ntxId);
    db.findPaymentByNormalizedTxId(ntxId, function(err, paymentByNtxId){
      if (err) { // Search by address to see if it's another payment to the same address
        // if we cant find by ntx look by address, maybe payment missed wallet notify
        console.log('Didnt find by ntxid, try address');
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
      else if(paymentByNtxId) {
        console.log('Reorg?');
        updatePaymentWithTxData(paymentByNtxId, transaction);
      }
    });
  });
  
}

function processReorgedPayments(blockHash) {
  db.getPaymentByBlockHash(blockHash, function(err, paymentsArr) {
    if (err) { return console.log(err); }
    if (paymentsArr) {
      paymentsArr.forEach(function (payment) {
        payment.block_hash = null;
        db.insert(payment);
      });
    }
  });
}

function processBlockHash(blockHashObj) {
  var blockHash = blockHashObj.hash;
  api.getBlock(blockHash, function(err, block) {
    if (err || !block) { return console.log(err); }
    console.log('> Block Valid: ' + validate.block(block));
    // If valid get transactions since last block (bitcore)
    if (validate.block(block)) {
      // Get List Since Block 
      bitcoinUtil.listSinceBlock(blockHash, function (err, info) {
        if (err) { return console.log(err); }
        var transactions = info.result.transactions;
        var lastBlockHash = info.result.lastblock;
        console.log(transactions);
        console.log(lastBlockHash);
        // Query couch for existing payments by ntxid if found update
        processPaymentsByNtxId(transactions);
        if (blockHash !== lastBlockHash) {
          blockHashObj.hash = lastBlockHash; // update to latest block
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
    console.log('===========================');
    console.log('Processing Last Block: ' + lastBlockHashObj.hash);
    console.log('===========================');    
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