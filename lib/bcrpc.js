/**
 * RPC agent, based on bitcore's RpcClient.
 */

var http = require('http');
var https = require('https');

/**
 * Source: https://en.bitcoin.it/wiki/Original_Bitcoin_client/API_calls_list
 * @type {Object}
 */
var BC_RPC = {
  addMultiSigAddress: [],
  addNode: [],
  backupWallet: [],
  createMultiSig: [],
  createRawTransaction: [],
  decodeRawTransaction: [],
  dumpPrivKey: [],
  encryptWallet: [],
  getAccount: [],
  getAccountAddress: [],
  getAddedNodeInfo: [],
  getAddressesByAccount: [],
  getBalance: [],
  getBestBlockHash: [],
  getBlock: [],
  getBlockCount: [],
  getBlockHash: [],
  getBlockTemplate: [],
  getConnectionCount: [],
  getDifficulty: [],
  getGenerate: [],
  getHashesPerSec: [],
  getInfo: [],
  getMemoryPool: [],
  getMiningInfo: [],
  getNewAddress: [],
  getPeerInfo: [],
  getRawChangeAddress: [],
  getRawMemPool: [],
  getRawTransaction: [],
  getReceivedByAccount: [],
  getReceivedByAddress: [],
  getTransaction: [],
  getTxOut: [],
  getTxOutSetInfo: [],
  getWork: [],
  help: [],
  importPrivKey: [],
  invalidateBlock: [],
  keyPoolRefill: [],
  listAccounts: [],
  listAddressGroupings: [],
  listReceivedByAccount: [],
  listReceivedByAddress: [],
  listSinceBlock: [],
  listTransactions: [],
  listUnspent: [],
  listLockUnspent: [],
  lockUnspent: [],
  move: [],
  sendFrom: [],
  sendMany: [],
  sendRawTransaction: [],
  sendToAddress: [],
  setAccount: [],
  setGenerate: [],
  setTxFee: [],
  signMessage: [],
  signRawTransaction: [],
  stop: [],
  submitBlock: [],
  validateAddress: [],
  verifyMessage: [],
  walletLock: [],
  walletPassPhrase: [],
  walletPassphraseChange: [],
};

function slice(arr, start, end) {
  return Array.prototype.slice.call(arr, start, end);
}

function RpcAgent(opts) {
  opts = opts || {};
  this.host = opts.host || '127.0.0.1';
  this.port = opts.port || 8332;
  this.user = opts.user || 'user';
  this.pass = opts.pass || 'pass';
  this.prot = opts.ssl ? https : http;
}

function rpc(request, callback) {
  var requestSerialized = JSON.stringify(request);
  var auth = new Buffer(this.user + ':' + this.pass).toString('base64');
  var options = {
    host: this.host,
    port: this.port,
    path: '/',
    method: 'POST',
  };
  var err = null;
  var req = this.prot.request(options, function(res) {
    var buf = '';
    res.on('data', function(data) {
      buf += data;
    });
    res.on('end', function() {
      if (res.statusCode === 401) {
        return callback(new Error('bitcoin JSON-RPC connection rejected: 401 unauthorized'));
      }
      if (res.statusCode === 403) {
        return callback(new Error('bitcoin JSON-RPC connection rejected: 403 forbidden'));
      }
      if (err) {
        return callback(err);
      }
      var bufDeserialized;
      try {
        bufDeserialized = JSON.parse(buf);
      } catch (e) {
        // TODO: error handling
      }
      return callback(bufDeserialized.error, bufDeserialized);
    });
  });
  req.on('error', function(e) {
    err = new Error('Could not connect to bitcoin via RPC at host: ' + this.host + ' port: ' + this.port + ' Error: ' + e.message);
    callback(err);
  });

  req.setHeader('Content-Length', requestSerialized.length);
  req.setHeader('Content-Type', 'application/json');
  req.setHeader('Authorization', 'Basic ' + auth);
  req.write(requestSerialized);
  req.end();
}

for (var cmd in BC_RPC) {
  RpcAgent.prototype[cmd] = (function(cmd) {
    return function rpccmd() {
      var args = arguments;
      rpc.call(this, {
        method: cmd.toLowerCase(),
        params: slice(args, 0, args.length - 1),
      }, args[args.length - 1]);
    };
  })(cmd);
}

module.exports = RpcAgent;
