var validate = require('./validate');
var config = require('./config');
var nano = require('nano')(config.dbUrl);
var dbname = 'basicpay';
var basicpay;

nano.db.create(dbname, function(err, body) {
  if (!err) { console.log('Database created.'); }
  basicpay = nano.use(dbname);
});

var findInvoiceAndPayments = function(invoiceId, cb) {
  basicpay.view(dbname, 'invoicesWithPayments', { key:invoiceId }, function (err, docs) {
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
  basicpay.view(dbname, 'payments', { key:address }, function (err, docs) {
    if (!err  && docs.rows && docs.rows.length > 0) {
      var payment = docs.rows[0].value;
      return cb(err, payment);
    }
    return cb(err, undefined);
  });
};

var findPaymentByNormalizedTxId = function(txId, cb) {
  basicpay.view(dbname, 'paymentsNormalizedTxId', { key:txId }, function (err, docs) {
    if (!err && docs.rows && docs.rows.length > 0) {
      var payment = docs.rows[0].value;
      return cb(err, payment);
    }
    return cb(err, undefined);
  });
};

var findInvoice = function(invoiceId, cb) {
  basicpay.view(dbname, 'invoices', { key:invoiceId }, function (err, docs) {
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
    basicpay.insert(invoice, cb);
  }
  else {
   cb('The received invoice failed validation. Verify that ' +
    'the invoice object being sent conforms to the specifications in the API');
  }
};

var createPayment = function(payment, cb) {
  basicpay.insert(payment, cb);
};

var update = function(doc, cb) { // Used to update a payment or invoice
  basicpay.insert(doc, cb);
};

module.exports = {
  findInvoiceAndPayments: findInvoiceAndPayments,
  findPayment: findPayment,
  findPaymentByNormalizedTxId: findPaymentByNormalizedTxId,
  findInvoice: findInvoice,
  createInvoice: createInvoice,
  createPayment: createPayment,
  update: update
};