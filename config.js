var _ = require('underscore');
var localConfig = {
  port: process.env.PORT || 8080,
  couchdb: {
    url: process.env.DB_URL || 'http://localhost:5984',
    name: 'baron'
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
  paidDelta: 0.1,
  updateWatchListInterval: 15000,
  lastBlockJobInterval: 15000,
  paymentValidForMinutes: 15,
  trackPaymentUntilConf: 100
};

// If config was passed in, export that. If not export local config.
module.exports = global.externalConfig ? _.extend(localConfig, global.externalConfig) : localConfig;