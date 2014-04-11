var bitcore = require('bitcore');
var RpcClient = bitcore.RpcClient;
var config = require('./config');

var client = new RpcClient({
  protocol: 'http',
  host: config.bitcoind.host,
  port: config.bitcoind.port,
  user: config.bitcoind.user,
  pass: config.bitcoind.pass
});

var getPaymentAddress = function(cb) {
  client.getNewAddress(cb);
};

var getTransaction = function(txId, cb) {
  client.getTransaction(txId, cb);
};

var getBlock = function(txId, cb) {
  client.getBlock(txId, cb);
};

var listSinceBlock = function(blockHash, cb) {
  client.listSinceBlock(blockHash, cb);
};

module.exports = {
  bitcoinClient: client,
  getPaymentAddress: getPaymentAddress,
  getTransaction: getTransaction,
  getBlock: getBlock,
  listSinceBlock: listSinceBlock
};

