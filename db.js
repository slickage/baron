var MongoClient = require('mongodb').MongoClient
  , format = require('util').format
  , ObjectID = require('mongodb').ObjectID;
var database, invoiceCol;
var config = require('./config');

MongoClient.connect(config.mongodb.url, function(err, db) {
  if(err) throw err;
  database = db;
  invoiceCol = db.collection('invoices');
  paymentCol = db.collection('payments');
});

module.exports = {
  findInvoice: function(invoiceId, cb) {
    invoiceCol.findOne({_id: new ObjectID(invoiceId)}, cb);
  },
  createInvoice: function(invoice, cb) {
    invoiceCol.insert(invoice, cb);
  },
  findPayment: function(paymentId, cb) {
    paymentCol.findOne({_id: new ObjectID(paymentId)}, cb);
  },
  createPayment: function(paymentData, cb) {
    paymentCol.insert(paymentData, cb);
  }
};