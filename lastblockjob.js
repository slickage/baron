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

function processPaymentsByNtxId(transactions) {
  transactions.forEach(function(transaction) {
    return console.log(transaction); // Remove
    if (!transaction.normtxid || !transaction.address) { return console.log('Transaction missing ntxid or address'); }
    var ntxId = transaction.normtxid;
    var address = transaction.address;
    db.findPaymentByNormalizedTxId(ntxId, function(err, paymentByNtxId){
      if (err) { // Search by address to see if its another payment to the same address
        invoiceUtil.createNewPaymentWithTransaction(address, transaction, false, function(err, body) {
          if (err) { return console.log('Error creating payment for txid: ' + transaction.txid); }
        });
      }
      else { // Found payment by ntx_id. Update payment data with tx data if necessary.

      }
    });
  });
}

function processBlockHash(blockHash) {
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
      });
    }
    else { // If invalid get block (insight) and step back
      // Query couch for existing payments by ntxid if found remove blockhash
      // Recursively check previousHash (processBlockHash(block.previousblockhash))
    }
  });
}

function lastBlockJob() {
  // Get Last Block, create it if baron isnt aware of one.
  getLastBlockHash(function(err, lastBlockHash) {
    if (err) { return console.log(err); }
    console.log('Processing Last Block: ' + lastBlockHash);
    processBlockHash(lastBlockHash);
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