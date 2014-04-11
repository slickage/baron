var localConfig = {
  port: process.env.PORT || 8080,
  dbUrl: process.env.DB_URL || 'http://localhost:5984',
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
  paidDelta: 0.1,
  dbName: 'baron',
  updateWatchListInterval: 15000,
  lastBlockJobInterval: 5000,
  trackPaymentForDays: 1,
  trackPaymentUntilConf: 100
};

// If config was passed in, export that. If not export local config.
module.exports = global.externalConfig ? global.externalConfig : localConfig;