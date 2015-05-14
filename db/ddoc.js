/* jshint couch: true */
'use strict';

var config = require(__dirname + '/../config');

var ddoc = {
  _id: '_design/' + (config.couchdb.name || 'baron'),
  views: {},
  lists: {},
  shows: {}
};

ddoc.views.invoicesWithPayments = {
  map: function(doc) {
    if (doc.type === 'invoice') {
      emit(doc._id, doc);
    }
    if (doc.type === 'payment') {
      emit(doc.invoice_id, doc);
    }
  }
};

ddoc.views.invoices = {
  map: function(doc) {
    if (doc.type === 'invoice') {
      emit(doc._id, doc);
    }
  }
};

ddoc.views.payments = {
  map: function(doc) {
    if (doc.type === 'payment') {
      emit(doc.address, doc);
    }
  }
};

ddoc.views.paymentsById = {
  map: function(doc) {
    if (doc.type === 'payment') {
      emit(doc._id, doc);
    }
  }
};

ddoc.views.paymentsBlockHash = {
  map: function(doc) {
    if (doc.type === 'payment') {
      emit(doc.blockhash, doc);
    }
  }
};

ddoc.views.paymentsTxId = {
  map: function(doc) {
    if (doc.type === 'payment') {
      emit(doc.txid, doc);
    }
  }
};

ddoc.views.watchedPayments = {
  map: function(doc) {
    if (doc.type === 'payment' && doc.watched) {
      emit(doc.address, doc);
    }
  }
};

ddoc.views.invoiceMetadataId = {
 map: function(doc) {
   if (doc.type === 'invoice' && doc.metadata && doc.metadata.id) {
     emit(doc.metadata.id, doc);
   }
 }
};

ddoc.views.paidPaymentsByTime = {
  map: function(doc) {
    if (doc.type === 'payment' && doc.blockhash) {
      emit(doc.paid_timestamp, doc);
    }
  }
};

ddoc.views.webhooks = {
  map: function(doc) {
    if (doc.type === 'webhook') {
      emit([doc.invoice_id, doc.created], doc);
    }
  }
};

module.exports = ddoc;