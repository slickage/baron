var config = require('./config');
var api = require('./insightapi');
var validate = require('./validate');
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

function lastBlockJob() {
  // Get Last Block, create it if baron isnt aware of one.
  getLastBlockHash(function(err, lastBlockHash) {
    if (err) { return console.log(err); }
    console.log(lastBlockHash);
    // Check that the last known block is still valid
    api.getBlock(lastBlockHash, function(err, block) {
      if (err) { return console.log(err); }
      console.log(validate.block(block));
    });
    // If valid get transactions since last block (bitcore)

    // If invalid get block (insight) and step back
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