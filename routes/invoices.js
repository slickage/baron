var db = require(__dirname + '/../db');
var config = require(__dirname + '/../config');
var invoiceRouteUtil = require(__dirname + '/utils/invoices');

var invoices = function(app) {
  
  // View Invoice by ID
  app.get('/invoices/:invoiceId', function(req, res) {
    var invoiceId = req.params.invoiceId;
    invoiceRouteUtil.findInvoiceAndPaymentHistory(invoiceId, function(err, invoice) {
      if (err) {
        return res.render('error', { appTitle: config.appTitle, errorMsg: err.message });
      }
      else {
        invoice.appTitle = config.appTitle;
        return res.render('invoice', invoice);
      }
    });
  });

  // Post invoice object to /invoice to create new invoice
  app.post('/invoices', function(req, res) {
    var invoice = req.body;
    if (!invoice.access_token || invoice.access_token && invoice.access_token !== config.baronAPIKey) {
      var err = new Error('Access Denied: Invalid access token.');
      console.log(req.ip + ' attempted to create an invoice with an invalid access token.');
      res.status(401).write(err.message);
      res.end();
    }
    else {
      db.createInvoice(req.body, function(err, invoiceData) {
        if(err) {
          res.status(400).write(err.message + '\n' + JSON.stringify(invoice));
          res.end();
        }
        else {
          console.log('Invoice ' + invoiceData.id + ': submitted by ' + req.ip);
          res.json(invoiceData);
        }
      });
    }
  });

};

module.exports = invoices;
