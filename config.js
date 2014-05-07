var _ = require('lodash');

var localConfig = {
  port: process.env.PORT || 8080,
  couchdb: {
    url: process.env.DB_URL || 'http://localhost:5984',
    name: process.env.DB_NAME || 'baron'
  },
  bitcoind:  {
    host: process.env.BITCOIND_HOST || 'localhost',
    port: Number(process.env.BITCOIND_PORT) || 18332,
    user: process.env.BITCOIND_USER || 'username',
    pass: process.env.BITCOIND_PASS || 'password'
  },
  insight: {
    host: process.env.INSIGHT_HOST || 'localhost',
    port: process.env.INSIGHT_PORT || '3001',
    protocol: process.env.INSIGHT_PROTOCOL || 'http'
  },
  postAccessToken: process.env.POST_ACCESS_TOKEN || 'youshouldreallychangethis',
  chainExplorerUrl: 'http://tbtc.blockr.io/tx/info',
  updateWatchListInterval: 15000,
  lastBlockJobInterval: 15000,
  retryWebhooksJobInterval: 15000,
  paymentValidForMinutes: 5,
  trackPaymentUntilConf: 100
};

// Do a union on local config and passed in config
module.exports = global.externalConfig ? _.extend(localConfig, global.externalConfig) : localConfig;