var validate = require('./validate');
var config = require('./config');
var nano = require('nano')(config.dbUrl);
var dbName = 'basicpay';
var baronDb;

nano.db.create(dbName, function(err, body) {
  if (!err) { console.log('Database created.'); }
  baronDb = nano.use(dbName);
});

var findInvoiceAndPayments = function(invoiceId, cb) {
  baronDb.view(dbName, 'invoicesWithPayments', { key:invoiceId }, function (err, docs) {
    if (err) { return cb(err, undefined, undefined); }
    var invoice;
    var paymentsArr = [];
    docs.rows.forEach(function (row) {
      if (row.value.type === 'invoice') {
        invoice = row.value;
      }
      else if (row.value.type === 'payment') {
        paymentsArr.push(row.value);
      }
    });
    cb(err, invoice, paymentsArr);
  });
};

var findPayment = function(address, cb) {
  baronDb.view(dbName, 'payments', { key:address }, function (err, docs) {
    if (!err  && docs.rows && docs.rows.length > 0) {
      var payment = docs.rows[0].value;
      return cb(err, payment);
    }
    return cb(err, undefined);
  });
};

var findPaymentByNormalizedTxId = function(txId, cb) {
  baronDb.view(dbName, 'paymentsNormalizedTxId', { key:txId }, function (err, docs) {
    if (!err && docs.rows && docs.rows.length > 0) {
      var payment = docs.rows[0].value;
      return cb(err, payment);
    }
    return cb(err, undefined);
  });
};

var findInvoice = function(invoiceId, cb) {
  baronDb.view(dbName, 'invoices', { key:invoiceId }, function (err, docs) {
    if (!err && docs.rows && docs.rows.length > 0) {
      var invoice = docs.rows[0].value;
      return cb(err, invoice);
    }
    return cb(err, undefined);
  });
};

var createInvoice = function(invoice, cb) {
  if (validate.invoice(invoice)) {
    invoice.created = new Date().getTime();
    invoice.type = 'invoice';
    baronDb.insert(invoice, cb);
  }
  else {
    return cb('The received invoice failed validation. Verify that the invoice' +
      ' object being sent conforms to the specifications in the API', undefined);
  }
};

var insert = function(doc, cb) { // Used to update a payment or invoice
  baronDb.insert(doc, cb);
};

module.exports = {
  findInvoiceAndPayments: findInvoiceAndPayments,
  findPayment: findPayment,
  findPaymentByNormalizedTxId: findPaymentByNormalizedTxId,
  findInvoice: findInvoice,
  createInvoice: createInvoice,
  insert: insert
};