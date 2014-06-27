/* jshint node: true */
'use strict';

var qr = require('qr-image');
var url = require('url');

var paymentqr = function(app) {
  // Generate payment QR Code
  app.get('/paymentqr', function(req, res) {
    var referrer = req.get('Referrer');
    referrer = referrer ? url.parse(referrer): null;
    var referrerHostname = referrer ? referrer.hostname : null;
    var address = req.query.address;
    if (req.host !== referrerHostname) {
      res.send(403, 'Rejected referrer.');
    } else if (!address) {
      res.send(400, 'Address is invalid: No address.');
    } else {
      var amount = Number(req.query.amount) || undefined;
      var code = qr.image('bitcoin:' + address + '?amount=' + amount, { type: 'svg' });
      res.type('svg');
      code.pipe(res);
    }
  });
};

module.exports = paymentqr;
