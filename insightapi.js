var request = require('request');
var config = require('./config');
var insightUrl = config.insight.protocol + '://' + config.insight.host + ':' + config.insight.port;

var getLastBlockHash = function(cb) {
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
    return cb(null, lastBlockHash);
  });
};

var getBlock = function(blockHash, cb){
  var requestUrl = insightUrl + '/api/block/' + blockHash;
  request(requestUrl, function(error, response, body) {
    if (error) { return cb(error, undefined); }
    var block = JSON.parse(body);
    return cb(null, block);
  });
};

module.exports = {
  getLastBlockHash: getLastBlockHash,
  getBlock: getBlock
};
