var config = require('./config');
var request = require('request');
var db = require('./db');

function getLastBlockFromInsight(cb) {
  var insightUrl = config.insight.protocol + '://' + config.insight.host + ':' + config.insight.port;
  var requestUrl = insightUrl + '/api/status?q=getLastBlockHash';
  request(requestUrl, function(error, response, body) {
    if (error) { return cb(error, undefined); }
    body = JSON.parse(body);
    if (!body.lastblockhash) {
      var err = new Error('Error retrieving last block from insight.');
      return cb(err, undefined);
    }
    var lastBlockHash = {
      hash: body.lastblockhash,
      type: 'blockhash'
    };
    cb(null, lastBlockHash);
  });
}

// Stores initial "last block hash" if it doesnt exist
function initializeLastBlock() {
  db.getLastKnownBlockHash(function(err, lastBlockHash) {
    if (err) { return console.log(err); } // TODO?
    if (!lastBlockHash) {
      getLastBlockFromInsight(function (err, lastBlockHash) {
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