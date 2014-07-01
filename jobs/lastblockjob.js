/* jshint node: true */
'use strict';

var config = require(__dirname + '/../config');
var bitcoinUtil = require(__dirname + '/../bitcoinutil');
var paymentUtil = require(__dirname + '/../paymentutil');
var db = require(__dirname + '/../db');
var async = require('async');
var lastBlockHash;
var lastBlockJobTime; // Milliseconds since previous lastBlockJob

function findPastValidBlock(blockHash, cb) {
  bitcoinUtil.getBlock(blockHash, function(err, block) {
    if (block && block.error && block.error.code && block.error.code === -5) {
      console.log('Fatal Error: Blockhash ' + blockHash + ' is not known to bitcoind.  This should never happen.');
      process.exit(255);
    }
    else if (err) {
      return cb(err, null);
    }
    block = block.result;
    if (block.confirmations === -1) {
      // NOTE: Reorg and double-spent handling is in updatePaymentWithTransaction.
      findPastValidBlock(block.previousblockhash, cb);
    }
    else {
      // Success
      cb(null, blockHash);
    }
  });
}

function findGenesisBlock(cb) {
  bitcoinUtil.getBlockHash(0, function(err,info) {
    if (err) {
      return cb(err);
    }
    else {
      cb(null, info.result);
    }
  });
}

// Determine blockHash safe for listSinceBlock
function pickPastBlockHash(cb) {
  if (lastBlockHash) {
    // Use lastBlockHash already known to Baron
    cb(null, lastBlockHash);
  }
  else {
    db.getLatestPaymentWithBlockHash(function(err,payment) {
      if (payment) {
        // Startup: attempt to find recent blockhash from the latest paid transaction
        findPastValidBlock(payment.blockhash, function(err, blockHash) {
          if (err) {
            cb(err);
          }
          else {
            console.log('lastBlockHash Initialized: ' + blockHash);
            cb(null, blockHash);
          }
        });
      }
      else {
        // Not found, set to genesis so listSinceBlock does not miss any transactions
        findGenesisBlock(function(err, blockHash) {
          if (err) {
            cb(err);
          }
          else {
            console.log('lastBlockHash Initialized from Genesis: ' + blockHash);
            cb(null, blockHash);
          }
        });
      }
    });
  }
}

// Update all transactions from bitcoind that happened since blockHash
function updatePaymentsSinceBlock(blockHash, cb) {
  bitcoinUtil.listSinceBlock(blockHash, function (err, info) {
    if (err) {
      return cb(err);
    }
    info = info.result;
    var transactions = [];
    info.transactions.forEach(function(transaction) {
      if (transaction.category === 'receive') { // we only care about received transactions
        transactions.push(transaction);
      }
    });
    var newBlockHash = info.lastblock;
    async.eachSeries(transactions, function(transaction, cbSeries) {
      paymentUtil.updatePayment(transaction, function() {
        cbSeries(); // We dont care if update fails just run everything in series until completion
      });
    },
    function() {
      if (blockHash !== newBlockHash) {
        cb(null, newBlockHash);
      }
      else {
        cb(null, blockHash);
      }
    });
  });
}

var lastBlockJob = function(callback) {
  var currentTime = new Date().getTime();
  // Skip lastBlockJob if previous was less than 1 second ago
  if (!lastBlockJobTime || currentTime > lastBlockJobTime + 1000) {
    lastBlockJobTime = currentTime;
    async.waterfall([
      function(cb) {
        pickPastBlockHash(cb);
      },
      function(blockHash, cb) {
        //console.log('DEBUG updatePaymentsSinceBlock:  ' + blockHash);
        updatePaymentsSinceBlock(blockHash, cb);
      }
      ], function(err, blockHash) {
        if (err) {
          console.log('lastBlockJob Error: ' + JSON.stringify(err));
        }
        else if (blockHash) {
          lastBlockHash = blockHash;
        }
        if (callback) {
          callback();
        }
    });
  }
  else {
    if (callback) {
      callback();
    }
  }
};

var runLastBlockJob = function () {
  setInterval(function(){
    lastBlockJob();
  }, config.lastBlockJobInterval);
  console.log('Baron Init: lastBlockJob running every ' + (config.lastBlockJobInterval / 1000) + ' seconds.');
};

module.exports = {
  runLastBlockJob: runLastBlockJob,
  lastBlockJob: lastBlockJob,
};
