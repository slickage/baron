'use strict';

var rootDir = __dirname + '/../';
var log = require(rootDir + '/log');
var db = require(rootDir + 'db');
var config = require(rootDir + 'config');
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
        if (!invoice.title) {
          invoice.title = config.appTitle;
        }
        return res.render('invoice', invoice);
      }
    });
  });

  // Post invoice object to /invoice to create new invoice
  app.post('/invoices', function(req, res) {
    var invoice = req.body;
    if (!invoice.api_key || invoice.api_key && invoice.api_key !== config.baronAPIKey) {
      var err = new Error('Access Denied: Invalid API key.');
      log.warn({ client_ip: req.ip, api_key: invoice.api_key }, req.ip + ' attempted to create an invoice with an invalid API key.');
      res.status(401).write(err.message);
      res.end();
    }
    else {
      db.createInvoice(req.body, function(err, invoiceData) {
        if(err) {
          log.error({err: err, client_ip: req.ip }, req.ip + ' createInvoice Error: ' + require('util').inspect(err.message));
          if (invoice.api_key && typeof invoice.api_key === 'string') {
            // Hide api_key from reply to reduce risk of leaks to users
            invoice.api_key = invoice.api_key.replace(/./g, 'X');
          }
          res.status(400).write(err.message + '\n' + JSON.stringify(invoice));
          res.end();
        }
        else {
          log.info({ client_ip: req.ip }, req.ip + ' created Invoice ' + invoiceData.id);
          res.json(invoiceData);
        }
      });
    }
  });

  // Post api_key to /invoices/:invoiceId/void to void an invoice
  app.post('/invoices/:invoiceId/void', function(req, res) {
    var invoiceId = req.params.invoiceId;
    var apiKey = req.body.api_key;
    if (!apiKey || apiKey && apiKey !== config.baronAPIKey) {
      var err = new Error('Access Denied: Invalid access token.');
      log.warn({ client_ip: req.ip, api_key: apiKey }, req.ip + ' attempted to void an invoice with an invalid API key.');
      res.status(401).write(err.message);
      res.end();
    }
    else {
      invoiceRouteUtil.findInvoiceAndPaymentHistory(invoiceId, function(err, invoice, origInvoice) {
        if (err) {
          res.status(400).write(err.message + '\nAPI KEY: ' + apiKey + '\nInvoice ID: ' + invoiceId);
          res.end();
        }
        else if (invoice.is_void) {
          res.status(200).write('Invoice ' + invoiceId + ' is already void.');
          res.end();
        }
        else if (Number(invoice.amount_paid) > 0) {
          res.status(400).write('Invoice ' + invoiceId + ' has payments, cannot be void.');
          res.end();
        }
        else {
          origInvoice.is_void = true;
          db.insert(origInvoice, function(err) {
            if (err) {
              res.status(400).write(err.message + '\nAPI KEY: ' + apiKey + '\nInvoice ID: ' + invoiceId);
              res.end();
            }
            else {
              res.status(200).write('Invoice ' + invoiceId + ' has been void.');
              res.end();
            }
          });
        }
      });
    }
  });

};

module.exports = invoices;
