var config = require(__dirname + '/config');

var ddoc = {
  _id: '_design/' + (config.couchdb.name || 'baron'),
  views: {},
  lists: {},
  shows: {}
};

module.exports = ddoc;

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
      emit(doc.block_hash, doc);
    }
  }
};

ddoc.views.paymentsTxId = {
  map: function(doc) {
    if (doc.type === 'payment') {
      emit(doc.tx_id, doc);
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

ddoc.views.lastBlockHash = {
  map: function(doc) {
    if (doc.type === 'blockhash') {
      emit(doc.hash, doc);
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
