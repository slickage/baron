var localConfig = {
  port: process.env.PORT || 8080,
  dbUrl: process.env.DB_URL || 'http://localhost:5984',
  bitcoind:  {
    host: process.env.BITCOIND_HOST || 'localhost',
    port: Number(process.env.BITCOIND_PORT) || 18332,
    user: process.env.BITCOIND_USER || 'bitcoinrpc',
    pass: process.env.BITCOIND_PASS || 'asdf1234'
  }
};

// If config was passed in, export that. If not export local config.
module.exports = global.externalConfig ? global.externalConfig : localConfig;