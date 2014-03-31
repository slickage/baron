var db = require('./db');
/*
  TODO List:
  - Store payment status as strings (paid, pending, unpaid, partial, overpaid, expired)
  - Payments should log the current "spot_rate" when paid (at 0 confirmations)
  - Add fudge rate for fiat balance due
  - Do we need to handle timezones for expiration? (James/Ed)
  - Need to handle locking in Rate for 5 minutes for fiat (Talk to James)
  - Hook up confirmations and status update from bitcoind
  - Add link to blockchain.info
*/

var init = function(app) {
  require('./routes')(app);
  require('bitstamped');
};

module.exports = {
  init: init,
  createInvoice: db.createInvoice,
  findInvoice: db.findInvoice
};