var qr = require('qr-image');

var paymentqr = function(app) {
  // Generate payment QR Code
  app.get('/paymentqr', function(req, res) {
    var address = req.query.address;
    if (address) {
      var amount = Number(req.query.amount) || undefined;
      var code = qr.image('bitcoin:' + address + '?amount=' + amount, { type: 'svg' });
      res.type('svg');
      code.pipe(res);
    }
    else {
      res.render('error', { errorMsg: 'Address is invalid: No address defined.' });
    }
  });
};

module.exports = paymentqr;
