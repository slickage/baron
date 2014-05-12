var config = {
  couchdb: {
    url: process.env.DB_URL || 'http://localhost:5984',
    name: process.env.DB_NAME || 'baron'
  },
  bitcoind:  {
    host: process.env.BITCOIND_HOST || 'localhost',
    port: process.env.BITCOIND_PORT || 18332,
    user: process.env.BITCOIND_USER || 'username',
    pass: process.env.BITCOIND_PASS || 'password'
  },
  insight: {
    host: process.env.INSIGHT_HOST || 'localhost',
    port: process.env.INSIGHT_PORT || '3001',
    protocol: process.env.INSIGHT_PROTOCOL || 'http'
  },
  port: process.env.PORT || 8080,
  appTitle: process.env.APP_TITLE || 'Baron',
  baronAPIKey: process.env.BARON_API_KEY || 'youshouldreallychangethis',
  chainExplorerUrl: process.env.CHAIN_EXPLORER_URL || 'http://tbtc.blockr.io/tx/info',
  updateWatchListInterval: process.env.UPDATE_WATCH_LIST_INTERVAL || 15000,
  lastBlockJobInterval: process.env.LAST_BLOCK_JOB_INTERVAL || 15000,
  webhooksJobInterval: process.env.WEBHOOKS_JOB_INTERVAL || 15000,
  paymentValidForMinutes: process.env.PAYMENT_VALID_FOR_MINUTES || 5,
  trackPaymentUntilConf: process.env.TRACK_PAYMENT_UNTIL_CONF || 100
};

module.exports = config;