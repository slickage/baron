var bitcoin = require('bitcoin');
var config = require('./config');

var client = new bitcoin.Client({
  host: config.bitcoind.host,
  port: config.bitcoind.port,
  user: config.bitcoind.user,
  pass: config.bitcoind.pass
});

module.exports = {
  bitcoinClient: client,
  getPaymentAddress: function(cb) {
    client.getNewAddress(cb);
  }
};

