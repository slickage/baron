var validate = require('./validate');
var config = require('./config');
var couchapp = require('couchapp');
var ddoc = require('./couchapp');
var nano = require('nano')(config.dbUrl);
var dbName = config.dbName || 'baron';
var baronDb;

var instantiateDb = function () {
  nano.db.get(dbName, function(err, body) {
    if (err) {
      nano.db.create(dbName, function(err, body) {
        if (err) { return process.exit(1); }
        console.log('Database created.');
        baronDb = nano.use(dbName);
        var dbUrl = config.dbUrl + '/' + config.dbName;
        couchapp.createApp(ddoc, dbUrl, function(app) {
          app.push();
        });
        return;
      });
    }
    baronDb = nano.use(dbName);
  });
};

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
    if (!err && body.rows && body.rows.length > 0) {
      var payment = body.rows[0].value;
      return cb(err, payment);
    }
    return cb(err, undefined);
  });
};

var findPayments = function(address, cb) {
  baronDb.view(dbName, 'payments', { key:address }, function (err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var paymentsArr = [];
      body.rows.forEach(function(row) {
        if (row.value.type === 'payment') {
          paymentsArr.push(row.value);
        }
      });
      return cb(err, paymentsArr);
    }
    return cb(err, undefined);
  });
};

var findPaymentByNormalizedTxId = function(ntxId, cb) {
  baronDb.view(dbName, 'paymentsNormalizedTxId', { key:ntxId }, function (err, body) {
    var payment = null;
    if (!err && body.rows && body.rows.length > 0) {
      payment = body.rows[0].value;
    }
    if (payment) {
      return cb(null, payment);
    }
    else if (!payment)  {
      return cb(new Error('No invoice matching ntx_id: ' + ntxId), undefined);
    } else {
      return cb(err, undefined);
    }
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
      var paymentsArr = [];
      body.rows.forEach(function(row) {
        if (row.value.type === 'payment') {
          paymentsArr.push(row.value);
        }
      });
      return cb(err, paymentsArr);
    }
    return cb(err, undefined);
  });
};

var getPaymentByBlockHash = function(blockHash, cb) {
  baronDb.view(dbName, 'paymentsBlockHash', { key:blockHash }, function (err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var paymentsArr = [];
      body.rows.forEach(function (row) {
        if (row.value.type === 'payment') {
          paymentsArr.push(row.value);
        }
      });
      return cb(err, paymentsArr);
    }
    return cb(err, undefined);
  });
};

var getLastKnownBlockHash = function(cb) {
  baronDb.view(dbName, 'lastBlockHash', function (err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var lastKnownBlockHash = body.rows[0].value;
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
  instantiateDb: instantiateDb,
  findInvoiceAndPayments: findInvoiceAndPayments,
  findPayment: findPayment,
  findPayments: findPayments,
  findPaymentByNormalizedTxId: findPaymentByNormalizedTxId,
  findInvoice: findInvoice,
  getWatchedPayments: getWatchedPayments,
  getPaymentByBlockHash: getPaymentByBlockHash,
  getLastKnownBlockHash: getLastKnownBlockHash,
  createInvoice: createInvoice,
  insert: insert
};