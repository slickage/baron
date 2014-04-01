var validate = require('./validate');
var config = require('./config');
var nano = require('nano')(config.dbUrl);
var dbname = 'basicpay';
var basicpay;

nano.db.create(dbname, function(err, body) {
  if (!err) { console.log('Database created.'); }
  basicpay = nano.use(dbname);
});

module.exports = {
  findInvoiceAndPayments: function(invoiceId, cb) {
    basicpay.view(dbname, 'invoicesWithPayments', { key:invoiceId }, function (err, docs) {
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