/**
 * RPC agent, based on bitcore's RpcClient.
 */

const http = require('http');
const https = require('https');

/**
 * Source: https://en.bitcoin.it/wiki/Original_Bitcoin_client/API_calls_list
 * @type {Object}
 */
const BC_RPC = {
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

const slice = (arr, start, end) => Array.prototype.slice.call(arr, start, end);

function RpcAgent(opts = {}) {
  this.host = opts.host || '127.0.0.1';
  this.port = opts.port || 8332;
  this.user = opts.user || 'user';
  this.pass = opts.pass || 'pass';
  this.prot = opts.ssl ? https : http;
}

function rpc(request, callback) {
  const requestSerialized = JSON.stringify(request);
  const auth = new Buffer(`${this.user}:${this.pass}`).toString('base64');
  const options = {
    host: this.host,
    port: this.port,
    path: '/',
    method: 'POST',
  };
  let err = null;
  const req = this.prot.request(options, (res) => {
    let buf = '';
    res.on('data', (data) => {
      buf += data;
    });
    res.on('end', () => {
      if (res.statusCode === 401) {
        return callback(new Error('bitcoin JSON-RPC connection rejected: 401 unauthorized'));
      }
      if (res.statusCode === 403) {
        return callback(new Error('bitcoin JSON-RPC connection rejected: 403 forbidden'));
      }
      if (err) {
        return callback(err);
      }
      let bufDeserialized;
      try {
        bufDeserialized = JSON.parse(buf);
      } catch (e) {
        // TODO: error handling
      }
      return callback(bufDeserialized.error, bufDeserialized);
    });
  });
  req.on('error', (e) => {
    err = new Error(`Could not connect to bitcoin via RPC at \
host: ${this.host} port: ${this.port} Error: ${e.message}`);
    callback(err);
  });

  req.setHeader('Content-Length', requestSerialized.length);
  req.setHeader('Content-Type', 'application/json');
  req.setHeader('Authorization', `Basic ${auth}`);
  req.write(requestSerialized);
  req.end();
}

for (const cmd of Object.keys(BC_RPC)) {
  RpcAgent.prototype[cmd] = function rpccmd(...args) {
    rpc.call(this, {
      method: cmd.toLowerCase(),
      params: slice(args, 0, args.length - 1),
    }, args[args.length - 1]);
  };
}

module.exports = RpcAgent;
