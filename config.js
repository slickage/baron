/* jshint node: true */
'use strict';

function guessExplorerURL(port) {
  port = parseInt(port);
  switch (port) {
    case (8332):
      return 'https://blockr.io/tx/info';
    case (18332):
      return 'https://tbtc.blockr.io/tx/info';
    default:
      return 'https://tbtc.blockr.io/tx/info'; // default to testnet
  }
}

var config = {
  couchdb: {
    host: process.env.DB_HOST || 'localhost:5984',
    name: process.env.DB_NAME || 'baron',
    ssl: process.env.DB_SSL || false,
    user: process.env.DB_USER || null,
    pass: process.env.DB_PASS || null
  },
  bitcoind: {
    host: process.env.BITCOIND_HOST || 'localhost',
    port: process.env.BITCOIND_PORT || 18332,
    user: process.env.BITCOIND_USER || 'username',
    pass: process.env.BITCOIND_PASS || 'password'
  },
  adminEmails: process.env.ADMIN_EMAILS || 'admin_one@example.com, admin_two@example.com',
  appTitle: process.env.APP_TITLE || 'Baron',
  baronAPIKey: process.env.BARON_API_KEY || 'youshouldreallychangethis',
  chainExplorerUrl: process.env.CHAIN_EXPLORER_URL || guessExplorerURL(process.env.BITCOIND_PORT || 18332),
  minimumBTC: process.env.MIN_BTC || 0.00001,
  minimumUSD: process.env.MIN_USD || 0.01,
  port: process.env.PORT || 8080,
  publicURL: process.env.PUBLIC_URL ||  'http://localhost:8080',
  senderEmail: process.env.SENDER_EMAIL || 'info@example.com',
  spotRateValidForMinutes: process.env.SPOTRATE_VALID_FOR_MINUTES || 5,
  trackPaymentUntilConf: process.env.TRACK_PAYMENT_UNTIL_CONF || 100,
  updateWatchListInterval: process.env.UPDATE_WATCH_LIST_INTERVAL || 15000,
  webhooksJobInterval: process.env.WEBHOOKS_JOB_INTERVAL || 15000

  // Disabled for now, might come back later
  //lastBlockJobInterval: process.env.LAST_BLOCK_JOB_INTERVAL || 15000,
};

module.exports = config;
