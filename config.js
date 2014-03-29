module.exports = {
  port: process.env.PORT || 8080,
  mongodb: {
    url: process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/basicpay',
  },
  bitcoind:  {
    host: process.env.BITCOIND_HOST || 'localhost',
    port: Number(process.env.BITCOIND_PORT) || 18332,
    user: process.env.BITCOIND_USER || 'bitcoinrpc',
    pass: process.env.BITCOIND_PASS || 'asdf1234'
  }
};