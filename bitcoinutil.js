var bitcoin = require('bitcoin');
var config = require('./config');

var client = new bitcoin.Client({
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

module.exports = {
  bitcoinClient: client,
  getPaymentAddress: getPaymentAddress,
  getTransaction: getTransaction,
  getBlock: getBlock
};

