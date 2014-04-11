var config = require('./config');
var api = require('./insightapi');
var db = require('./db');

// Stores initial "last block hash" if it doesnt exist
function initializeLastBlock() {
  db.getLastKnownBlockHash(function(err, lastBlockHash) {
    if (err) { return console.log(err); } // TODO?
    if (!lastBlockHash) {
      api.getLastBlock(function (err, lastBlockHash) {
        if (err) { return console.log('error'); }
        db.insert(lastBlockHash);
      });
    }
  });
}

function lastBlockJob() {
  // Create Initial Db value for last block if it doesnt exist
  initializeLastBlock();

  // Check that the last known block is still valid


  // If valid get transactions since last block (bitcore)

  // If invalid get block (insight) and step back

}

var runLastBlockJob = function () {
  setInterval(function(){
    lastBlockJob();
  }, config.lastBlockJobInterval);
};

module.exports = {
  runLastBlockJob:runLastBlockJob,
};