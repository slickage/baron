'use strict';

var RpcClient = require('./bcrpc');
var config = require('../config');

var client = new RpcClient({
  prot: 'http',
  host: config.bitcoind.host,
  port: config.bitcoind.port,
  user: config.bitcoind.user,
  pass: config.bitcoind.pass
});

module.exports = client;
