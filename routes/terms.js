var db = require(__dirname + '/../db');
var sanitize = require('google-caja').sanitize;

var terms = function(app) {
  app.get('/terms/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    db.findInvoice(invoiceId, function (err, invoice) {
      if (err) {
        res.render('error', { errorMsg: err.message });
      }
      else if (!invoice.terms) {
        res.render('error', { errorMsg: 'This invoice does not have terms and conditions.' });
      }
      else {
        res.render('terms', { terms: sanitize(invoice.terms), invoiceId: invoice._id });
      }
    });
  });
};

module.exports = terms;