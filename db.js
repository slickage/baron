var MongoClient = require('mongodb').MongoClient,
    ObjectID = require('mongodb').ObjectID;
var database, invoiceCol;
var config = require('./config');
var validate = require('./validate');

MongoClient.connect(config.mongodb.url, function(err, db) {
  if (err) { throw err; }
  database = db;
  invoiceCol = db.collection('invoices');
});

module.exports = {
  findInvoice: function(invoiceId, cb) {
    try {
      invoiceCol.findOne({_id: new ObjectID(invoiceId)}, cb);
    }
    catch (e) {
      cb('Invalid Invoice ID.');
    }
  },
  createInvoice: function(invoice, cb) {
    if (validate.invoice(invoice)) {
      if (!invoice.payments) {
        invoice.payments = {};
      }
      invoice.created = new Date().getTime();
      invoiceCol.insert(invoice, cb);
    }
    else {
     cb('The received invoice failed validation. Verify that ' +
      'the invoice object being sent conforms to the specifications in the API');
    }
  },
  updateInvoice: function(invoice, cb) {
    invoiceCol.save(invoice, cb);
  }
};