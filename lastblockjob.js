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
  initializeLastBlock();

}

var runLastBlockJob = function () {
  setInterval(function(){
    lastBlockJob();
  }, config.lastBlockJobInterval);
};

module.exports = {
  runLastBlockJob:runLastBlockJob,
};