var config = require('./config');
var api = require('./insightapi');
var validate = require('./validate');
var bitcoinUtil = require('./bitcoinutil');
var invoiceUtil = require('./invoiceutil');
var db = require('./db');

// Stores initial "last block hash" if it doesnt exist returns it if it does
function getLastBlockHash(cb) {
  db.getLastKnownBlockHash(function(err, lastBlockHash) {
    if (err) { return cb(err, null); }
    if (lastBlockHash) { return cb(null, lastBlockHash); }
    else {
      api.getLastBlockHash(function (err, lastBlockHash) {
        if (err) { return cb(err, null); }
        db.insert(lastBlockHash, function(err) {
          if (err) { return cb(err, null); }
          return cb(null, lastBlockHash);
        });
      });
    }
  });
}

function processReorgedPayments(blockHash) {
  db.getPaymentByBlockHash(blockHash, function(err, paymentsArr) {
    if (err) { return console.log(err); }
    if (paymentsArr) {
      paymentsArr.forEach(function (payment) {
        payment.block_hash = null;
        console.log('REORG: Payment Reorged. Clearing blockhash.');
        // payment.reorg = true; Should we add this?
        db.insert(payment);
      });
    }
  });
}

function processBlockHash(blockHashObj) {
  var blockHash = blockHashObj.hash;
  api.getBlock(blockHash, function(err, block) {
    if (err || !block) {
      // TODO: If there's an error, lastblock in db is probably corrupt.
      // Should we update the latest block? 
      return console.log(err);
    }
    console.log('> Block Valid: ' + validate.block(block));
    // If valid get transactions since last block (bitcore)
    if (validate.block(block)) {
      // Get List Since Block 
      bitcoinUtil.listSinceBlock(blockHash, function (err, info) {
        if (err) { return console.log(err); }
        var transactions = info.result.transactions;
        var lastBlockHash = info.result.lastblock;
        // Query couch for existing payments by ntxid if found update
        transactions.forEach(function(transaction) {
          if (!transaction.normtxid || !transaction.address || transaction.amount < 0) { return console.log('Ignoring irrelevant transaction data.'); }
          invoiceUtil.updatePayment(transaction, function(err) {
            if (err) { console.log('Error updating payment with ntxid: ' + transaction.normtxid); }
          });
        });
        if (blockHash !== lastBlockHash) {
          blockHashObj.hash = lastBlockHash; // update to latest block
          db.insert(blockHashObj); // insert updated last block into db
        }
      });
    }
    else { // If invalid update all transactions in block and step back
      // Update reorged transactions (set block_hash = null)
      processReorgedPayments(block.hash);
      console.log('REORG: Recursively handling processing previous block.');
      // Recursively check previousHash
      blockHashObj.hash = block.previousblockhash;
      processBlockHash(blockHashObj);
    }
  });
}

var lastBlockJob = function() {
  // Get Last Block, create it if baron isnt aware of one.
  getLastBlockHash(function(err, lastBlockHashObj) {
    if (err || !lastBlockHashObj.hash) { return console.log(err); }
    console.log('===========================');
    console.log('Processing Last Block: ' + lastBlockHashObj.hash);
    console.log('===========================');
    processBlockHash(lastBlockHashObj);
  });
};

var runLastBlockJob = function () {
  setInterval(function(){
    lastBlockJob();
  }, config.lastBlockJobInterval);
};

module.exports = {
  runLastBlockJob: runLastBlockJob,
  lastBlockJob: lastBlockJob,
};