var validate = require('./validate');
var config = require('./config');
var nano = require('nano')(config.dbUrl);
var dbName = config.dbName || 'baron';
var baronDb;

nano.db.create(dbName, function(err, body) {
  if (!err) { console.log('Database created.'); }
  baronDb = nano.use(dbName);
});

var findInvoiceAndPayments = function(invoiceId, cb) {
  baronDb.view(dbName, 'invoicesWithPayments', { key:invoiceId }, function (err, body) {
    if (err) { return cb(err, undefined, undefined); }
    var invoice;
    var paymentsArr = [];
    if (body.rows.length <= 0) {
      return cb(new Error('Error: No invoice found.'), undefined, undefined);
    }
    body.rows.forEach(function (row) {
      if (row.value.type === 'invoice') {
        invoice = row.value;
      }
      else if (row.value.type === 'payment') {
        paymentsArr.push(row.value);
      }
    });
    return cb(err, invoice, paymentsArr);
  });
};

var findPayment = function(address, cb) {
  baronDb.view(dbName, 'payments', { key:address }, function (err, body) {
    if (!err  && body.rows && body.rows.length > 0) {
      var payment = body.rows[0].value;
      return cb(err, payment);
    }
    return cb(err, undefined);
  });
};

var findPaymentByNormalizedTxId = function(txId, cb) {
  baronDb.view(dbName, 'paymentsNormalizedTxId', { key:txId }, function (err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var payment = body.rows[0].value;
      return cb(err, payment);
    }
    return cb(err, undefined);
  });
};

var findInvoice = function(invoiceId, cb) {
  baronDb.view(dbName, 'invoices', { key:invoiceId }, function (err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var invoice = body.rows[0].value;
      return cb(err, invoice);
    }
    return cb(err, undefined);
  });
};

var getWatchedPayments = function(cb) {
  baronDb.view(dbName, 'watchedPayments', function (err, body) {
     if (!err && body.rows && body.rows.length > 0) {
      var paymentsArr = body.rows;
      return cb(err, paymentsArr);
    }
    return cb(err, undefined);
  });
};

var getLastKnownBlockHash = function(cb) {
  baronDb.view(dbName, 'lastBlockHash', function (err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var lastKnownBlockHash = body.rows[0].value.hash;
      return cb(err, lastKnownBlockHash);
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
  getWatchedPayments: getWatchedPayments,
  getLastKnownBlockHash: getLastKnownBlockHash,
  createInvoice: createInvoice,
  insert: insert
};