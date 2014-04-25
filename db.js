var validate = require('./validate');
var config = require('./config');
var couchapp = require('couchapp');
var ddoc = require('./couchapp');
var nano = require('nano')(config.couchdb.url);
var dbName = config.couchdb.name || 'baron';
var baronDb;

var pushViews = function () {
  var dbUrl = config.couchdb.url + '/' + config.couchdb.name;
  couchapp.createApp(ddoc, dbUrl, function(app) {
    app.push();
  });
};

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
        pushViews();
        return;
      });
    }
    baronDb = nano.use(dbName);
  });
};

var findInvoiceAndPayments = function(invoiceId, cb) {
  baronDb.view(dbName, 'invoicesWithPayments', { key:invoiceId }, function(err, body) {
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
  baronDb.view(dbName, 'payments', { key:address }, function(err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var payment = body.rows[0].value;
      return cb(err, payment);
    }
    return cb(err, undefined);
  });
};

var findPaymentById = function(paymentId, cb) {
  baronDb.view(dbName, 'paymentsById', { key:paymentId }, function(err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var payment = body.rows[0].value;
      return cb(err, payment);
    }
    return cb(err, undefined);
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
      return cb(err, paymentsArr);
    }
    return cb(err, undefined);
  });
};

var findPaymentByNormalizedTxId = function(ntxId, cb) {
  baronDb.view(dbName, 'paymentsNormalizedTxId', { key:ntxId }, function(err, body) {
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
  baronDb.view(dbName, 'invoices', { key:invoiceId }, function(err, body) {
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
  if (!invoice.access_token || invoice.access_token && invoice.access_token !== config.postAccessToken) {
    var err = new Error('Access Denied: Invalid access token.');
    return cb(err, undefined);
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
    return cb(invalidErr, undefined);
  }
};

var deleteDoc = function(doc, cb) {
   baronDb.destroy(doc._id, doc._rev, function(err) {
    if (err) {
      return cb(err);
    }
    else {
      return cb(null);
    }
  });
};

var insert = function(doc, cb) { // Used to update a payment or invoice
  baronDb.insert(doc, cb);
};

module.exports = {
  pushViews: pushViews,
  instantiateDb: instantiateDb,
  findInvoiceAndPayments: findInvoiceAndPayments,
  findPayment: findPayment,
  findPaymentById: findPaymentById,
  findPayments: findPayments,
  findPaymentByNormalizedTxId: findPaymentByNormalizedTxId,
  findInvoice: findInvoice,
  getWatchedPayments: getWatchedPayments,
  getPaymentByBlockHash: getPaymentByBlockHash,
  getLastKnownBlockHash: getLastKnownBlockHash,
  createInvoice: createInvoice,
  insert: insert,
  deleteDoc: deleteDoc
};