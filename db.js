var validate = require(__dirname + '/validate');
var config = require(__dirname + '/config');
var couchapp = require('couchapp');
var ddoc = require(__dirname + '/couchapp');
var nano = require('nano')(config.couchdb.url);
var dbName = config.couchdb.name;
var BigNumber = require('bignumber.js');
var baronDb;

function cleanupDummyRecords(dummyRecords, exit) {
  destroy(dummyRecords[0].id, dummyRecords[0].rev, function(err) {
    if(!err) {
      destroy(dummyRecords[1].id, dummyRecords[1].rev, function(err) {
        if (!err && exit) {
          console.log('Error:  CouchDB\'s UUID Algorithm must be random: http://docs.couchdb.org/en/latest/config/misc.html#uuids/algorithm');
          return process.exit(1);
        }
      });
    }
  });
}

function checkUUIDAlg() {
  insert({}, function(err, recordA){
    if (!err) {
      insert({}, function(err, recordB){
        if (!err) {
          var prefixA = recordA.id.substring(0,9);
          var prefixB = recordB.id.substring(0,9);
          cleanupDummyRecords([recordA, recordB], prefixA === prefixB);
        }
      });
    }
  });
}

var instantiateDb = function () {
  nano.db.get(dbName, function(err) {
    if (err) {
      if (err.code && err.code === 'ECONNREFUSED') {
        console.log('Error: CouchDB connection refused at ' + config.couchdb.url);
        return process.exit(1);
      }
      if (err.reason && err.reason === 'no_db_file') {
        nano.db.create(dbName, function(err) {
          console.log('Database created.');
          baronDb = nano.use(dbName);
          var dbUrl = config.couchdb.url + '/' + config.couchdb.name;
          couchapp.createApp(ddoc, dbUrl, function(app) {
            app.push();
          });
          checkUUIDAlg();
        });
      }
    }
    else {
      baronDb = nano.use(dbName);
      checkUUIDAlg();
    }
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
  baronDb.view(dbName, 'watchedPayments', function(err, body) {
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
  baronDb.view(dbName, 'paymentsBlockHash', { key:blockHash }, function(err, body) {
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

var getLastKnownBlockHash = function(cb) {
  baronDb.view(dbName, 'lastBlockHash', function(err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var lastKnownBlockHash = body.rows[0].value;
      return cb(err, lastKnownBlockHash);
    }
    return cb(err, null);
  });
};

var createInvoice = function(invoice, cb) {
  if (validate.invoice(invoice)) {
    invoice.access_token = undefined;
    invoice.created = new Date().getTime();
    invoice.type = 'invoice';
    var balanceDue = new BigNumber(0);
    invoice.line_items.forEach(function(item) {
      var lineCost = new BigNumber(item.amount).times(item.quantity);
      balanceDue = balanceDue.plus(lineCost);
    });
    invoice.balance_due = Number(balanceDue.valueOf());
    baronDb.insert(invoice, cb);
  }
  else {
    var invalidErr = new Error('The received invoice failed validation. Verify that the invoice' +
      ' object being sent conforms to the specifications in the API');
    return cb(invalidErr, null);
  }
};

var getWebhooks = function (cb) {
  baronDb.view(dbName, 'webhooks', function(err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var webhooksArr = [];
      body.rows.forEach(function(row) {
        if (row.value.type === 'webhook') {
          webhooksArr.push(row.value);
        }
      });
      return cb(err, webhooksArr);
    }
    return cb(err, null);
  });
};

var insert = function(doc, cb) { // Used to update a payment or invoice
  baronDb.insert(doc, cb);
};

var destroy = function(docId, docRev, cb) { // Used to update a payment or invoice
  baronDb.destroy(docId, docRev, cb);
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
  getWebhooks: getWebhooks,
  insert: insert,
  destroy: destroy
};
