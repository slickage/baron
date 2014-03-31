var validate = require('./validate');
var nano = require('nano')('http://localhost:5984');
var dbname = 'basicpay';
var basicpay;

nano.db.create(dbname, function(err, body) {
  if (!err) { console.log('Database created.'); }
  basicpay = nano.use(dbname);
});

module.exports = {
  findInvoice: function(invoiceId, cb) {
    basicpay.view(dbname, 'invoicesWithPayments', { key:invoiceId }, cb);
  },
  createInvoice: function(invoice, cb) {
    if (validate.invoice(invoice)) {
      invoice.created = new Date().getTime();
      invoice.type = 'invoice';
      basicpay.insert(invoice, cb);
    }
    else {
     cb('The received invoice failed validation. Verify that ' +
      'the invoice object being sent conforms to the specifications in the API');
    }
  },
  createPayment: function(payment, cb) {
    basicpay.insert(payment, cb);
  },
  update: function(doc, cb) { // Used to update a payment or invoice
    basicpay.insert(doc, cb);
  }
};