var validate = require('./validate');
var config = require('./config');
var couchapp = require('couchapp');
var ddoc = require('./couchapp');
var nano = require('nano')(config.couchdb.url);
var dbName = config.couchdb.name || 'baron';
var baronDb;

var instantiateDb = function () {
  nano.db.get(dbName, function(err) {
    if (err) {
      nano.db.create(dbName, function(err) {
        if (err) {
          console.log('Pleases ensure that couchdb is running.');
          return process.exit(1);
        }
        console.log('Database created.');
        baronDb = nano.use(dbName);
        var dbUrl = config.couchdb.url + '/' + config.couchdb.name;
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
  baronDb.view(dbName, 'invoicesWithPayments', { key:invoiceId }, function(err, body) {
    if (err) { return cb(err, null, null); }
    var invoice;
    var paymentsArr = [];
    if (body.rows.length <= 0) {
      var error = new Error('Error: No invoice found.');
      return cb(error, null, null);
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

var findPaymentById = function(paymentId, cb) {
  baronDb.view(dbName, 'paymentsById', { key:paymentId }, function(err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var payment = body.rows[0].value;
      return cb(err, payment);
    }
    return cb(err, null);
  });
};

var findPayments = function(address, cb) {
  baronDb.view(dbName, 'payments', { key:address }, function(err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var paymentsArr = [];
      body.rows.forEach(function(row) {
        if (row.value.type === 'payment') {
          paymentsArr.push(row.value);
        }
      });
      return cb(null, paymentsArr);
    }
    var noPaymentsFoundErr = new Error('No payments found.');
    return cb(noPaymentsFoundErr, null);
  });
};

var findPaymentByTxId = function(txId, cb) {
  baronDb.view(dbName, 'paymentsTxId', { key:txId }, function(err, body) {
    var payment = null;
    if (!err && body.rows && body.rows.length > 0) {
      payment = body.rows[0].value;
    }
    if (payment) {
      return cb(null, payment);
    }
    else if (!payment)  {
      var error = new Error('No invoice matching tx_id: ' + txId);
      return cb(error, null);
    } else {
      return cb(err, null);
    }
  });
};

var findInvoice = function(invoiceId, cb) {
  baronDb.view(dbName, 'invoices', { key:invoiceId }, function(err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var invoice = body.rows[0].value;
      return cb(err, invoice);
    }
    return cb(err, null);
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
    return cb(err, null);
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
    return cb(err, null);
  });
};

var getLastKnownBlockHash = function(cb) {
  baronDb.view(dbName, 'lastBlockHash', function (err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var lastKnownBlockHash = body.rows[0].value;
      return cb(err, lastKnownBlockHash);
    }
    return cb(err, null);
  });
};

var createInvoice = function(invoice, cb) {
  if (!invoice.access_token || invoice.access_token && invoice.access_token !== config.postAccessToken) {
    var err = new Error('Access Denied: Invalid access token.');
    return cb(err, null);
  }
  else if (validate.invoice(invoice)) {
    invoice.access_token = undefined;
    invoice.created = new Date().getTime();
    invoice.type = 'invoice';
    baronDb.insert(invoice, cb);
  }
  else {
    var invalidErr = new Error('The received invoice failed validation. Verify that the invoice' +
      ' object being sent conforms to the specifications in the API');
    return cb(invalidErr, null);
  }
};

var insert = function(doc, cb) { // Used to update a payment or invoice
  baronDb.insert(doc, cb);
};

module.exports = {
  instantiateDb: instantiateDb,
  findInvoiceAndPayments: findInvoiceAndPayments,
  findPaymentById: findPaymentById,
  findPayments: findPayments,
  findPaymentByTxId: findPaymentByTxId,
  findInvoice: findInvoice,
  getWatchedPayments: getWatchedPayments,
  getPaymentByBlockHash: getPaymentByBlockHash,
  getLastKnownBlockHash: getLastKnownBlockHash,
  createInvoice: createInvoice,
  insert: insert
};