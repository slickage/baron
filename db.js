var MongoClient = require('mongodb').MongoClient
  , format = require('util').format
  , ObjectID = require('mongodb').ObjectID;
var database, invoiceCol;
var config = require('./config');

MongoClient.connect(config.mongodb.url, function(err, db) {
  if(err) throw err;
  database = db;
  invoiceCol = db.collection('invoices');
});

module.exports = {
  findInvoice: function(invoiceId, cb) {
    invoiceCol.findOne({_id: new ObjectID(invoiceId)}, cb);
  },
  createInvoice: function(invoice, cb) {
    invoiceCol.insert(invoice, cb);
  },
  updateInvoice: function(invoice, cb) {
    invoiceCol.save(invoice, cb);
  }
};