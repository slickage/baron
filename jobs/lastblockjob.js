var config = require(__dirname + '/../config');
var validate = require(__dirname + '/../validate');
var bitcoinUtil = require(__dirname + '/../bitcoinutil');
var paymentUtil = require(__dirname + '/../paymentutil');
var db = require(__dirname + '/../db');
var async = require('async');

// Stores initial "last block hash" if it doesnt exist returns it if it does
function getLastBlockHash(cb) {
  db.getLastKnownBlockHash(function(err, lastBlockHash) {
    if (err) {
      return cb(err, null);
    }
    if (lastBlockHash) {
      return cb(null, lastBlockHash);
    }
    else {
      bitcoinUtil.getBestBlockHash(function (err, lastBlockHash) {
        if (err) {
          return cb(err, null);
        }
        lastBlockHash.hash = lastBlockHash.result;
        lastBlockHash.type = 'blockhash';
        delete lastBlockHash.id;
        delete lastBlockHash.error;
        delete lastBlockHash.result;
        db.insert(lastBlockHash, function(err) {
          if (err) {
            return cb(err, null);
          }
          return cb(null, lastBlockHash);
        });
      });
    }
  });
}

function processBlockHash(blockHashObj) {
  var blockHash = blockHashObj.hash;
  bitcoinUtil.getBlock(blockHash, function(err, block) {
    if (block && block.error && block.error.code && block.error.code === -5) {
      console.log('Fatal Error: Blockhash ' + blockHash + ' is not known to bitcoind.  This should never happen.  Delete lastBlockHash from baron db if you wish to proceed.');
      process.exit(1);
    } else if (err) {
      return console.log(err);
    }
    block = block.result;
    //console.log('> Block Valid: ' + validate.block(block));
    // Get List Since Block 
    bitcoinUtil.listSinceBlock(blockHash, function (err, info) {
      if (err) {
        return console.log(err);
      }
      info = info.result;
      var transactions = [];
      info.transactions.forEach(function(transaction) {
        if (transaction.category === 'receive') { // ignore sent tx's
          transactions.push(transaction);
        }
      });
      var lastBlockHash = info.lastblock;
      // If valid get transactions since last block (bitcore)
      if (validate.block(block)) {
        async.eachSeries(transactions, function(transaction, cb) {
          paymentUtil.updatePayment(transaction, function() {
            cb(); // We dont care if update fails just run everthing in series until completion
          });
        }, function(err) {
          if (!err) {
            if (blockHash !== lastBlockHash) {
              blockHashObj.hash = lastBlockHash; // update to latest block
              db.insert(blockHashObj); // insert updated last block into db
            }
          }
        });
      }
      else { // If invalid update all transactions in block and step back
        transactions.forEach(function(transaction) {
          paymentUtil.processReorgAndCheckDoubleSpent(transaction, block.hash);
        }); // For each should block until complete
        paymentUtil.processReorgedPayments(block.hash);
        // Update reorged transactions (set block_hash = null)
        console.log('> REORG: Recursively processing previous block: ' + block.previousblockhash);
        // Recursively check previousHash
        blockHashObj.hash = block.previousblockhash;
        processBlockHash(blockHashObj);
    }
    });
  });
}

var lastBlockJob = function() {
  // Get Last Block, create it if baron isnt aware of one.
  getLastBlockHash(function(err, lastBlockHashObj) {
    if (err) {
      return console.log(err);
    }
    else if (!lastBlockHashObj.hash) {
      return console.log('Last block object missing hash, check Baron\'s database');
    }
    console.log('lastBlockJob: ' + lastBlockHashObj.hash);
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
