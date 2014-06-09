var invoiceRouteUtil = require(__dirname + '/../utils/invoices');

module.exports = function(api) {
  api.route('/invoices/:invoiceId').get(function(req, res) {
    invoiceRouteUtil.findInvoiceAndPaymentHistory(req.params.invoiceId, function(err, invoice) {
      if (!err) {
        res.json(invoice);
      }
    });
  });
};