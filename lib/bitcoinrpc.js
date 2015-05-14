'use strict';

var bitcore = require('bitcore');
var RpcClient = bitcore.RpcClient;
var config = require(__dirname + '/../config');

var client = new RpcClient({
  protocol: 'http',
  host: config.bitcoind.host,
  port: config.bitcoind.port,
  user: config.bitcoind.user,
  pass: config.bitcoind.pass
});

module.exports = client;

