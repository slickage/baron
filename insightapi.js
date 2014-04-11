var request = require('request');
var config = require('./config');
var insightUrl = config.insight.protocol + '://' + config.insight.host + ':' + config.insight.port;

var getLastBlock = function(cb) {
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
};

module.exports = {
  getLastBlock: getLastBlock
};
