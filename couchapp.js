var ddoc = {
  _id: '_design/basicpay',
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