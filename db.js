var validate = require(__dirname + '/validate');
var config = require(__dirname + '/config');
var ddoc = require(__dirname + '/ddoc');
var nano = require('nano')(config.couchdb.url);
var dbName = config.couchdb.name;
var BigNumber = require('bignumber.js');
var async = require('async');
var baronDb;

// Abort if CouchDB is not using the random UUID algorithm
// It would otherwise be unsafe because the Invoice ID's would be easily guessable.
function abortIfNotRandomAlgorithm(cb) {
  function cleanupAndAbortIfNotRandom(dummyRecords, exit, cb) {
    destroy(dummyRecords[0].id, dummyRecords[0].rev, function(err) {
      if(!err) {
        destroy(dummyRecords[1].id, dummyRecords[1].rev, function(err) {
          if (!err && exit) {
            console.log('Error:  CouchDB\'s UUID Algorithm must be random: http://docs.couchdb.org/en/latest/config/misc.html#uuids/algorithm');
            return process.exit(1);
          }
          else { cb(); }
        });
      }
    });
  }
  // Insert two dummy records, abort if their first nine characters are equal (not random)
  insert({}, function(err, recordA){
    if (!err) {
      insert({}, function(err, recordB){
        if (!err) {
          var prefixA = recordA.id.substring(0,9);
          var prefixB = recordB.id.substring(0,9);
          cleanupAndAbortIfNotRandom([recordA, recordB], prefixA === prefixB, cb);
        }
      });
    }
  });
}

var instantiateDb = function (cb) {
  nano.db.get(dbName, function(err) {
    if (err) {
      if (err.code && err.code === 'ECONNREFUSED') {
        console.log('Error: CouchDB connection refused at ' + config.couchdb.url);
        return process.exit(1);
      }
      else if (err.reason && err.reason === 'no_db_file') {
        nano.db.create(dbName, function(err) {
          if (err) {
            console.log('Error: Failed to create database:\n' + err);
            return process.exit(1);
          }
          else {
            console.log('Database created.');
            baronDb = nano.use(dbName);
            baronDb.insert(ddoc, function(err) {
              if (err) {
                console.log('Error: Failed to push design document:\n' + err);
                return process.exit(1);
              }
              else {
                abortIfNotRandomAlgorithm(cb);
              }
            });
          }
        });
      }
      else {
        console.log(err);
        return process.exit(1);
      }
    }
    else {
      baronDb = nano.use(dbName);
      abortIfNotRandomAlgorithm(cb);
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

var findMatchingMetadataId = function(metadataId, cb) {
  baronDb.view(dbName, 'invoiceMetadataId', { key:metadataId }, function(err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var matchingInvoice = body.rows[0].value;
      return cb(err, matchingInvoice);
    }
  return cb(err, null);
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

var findPaymentsByTxId = function(txid, cb) {
  baronDb.view(dbName, 'paymentsTxId', { key:txid }, function(err, body) {
    var payments = [];
    if (!err && body && body.rows) {
      body.rows.forEach(function(row) {
        payments.push(row.value);
      });
    }
    return cb(err, payments);
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

var createInvoice = function(invoice, callback) {
  // Helper: find invoice with matching metadata.id
  function reuseInvoice(invoice, cb) {
    if (invoice.metadata && invoice.metadata.id) {
      findMatchingMetadataId(invoice.metadata.id, function(err, result) {
        cb(err, result);
      });
    }
    else {
      cb(undefined, null);
    }
  }

  async.waterfall([
    function(cb) {
      // Validate Invoice
      if (!validate.invoice(invoice)) {
        var invalidErr = new Error('The received invoice failed validation. Verify that the invoice' +
          ' object being sent conforms to the specifications in the API');
        cb(invalidErr, null);
      }
      else { cb(); }
    },
    function(cb) {
      // Special Case: Reuse existing invoice of matching metadata.id
      reuseInvoice(invoice, function (err, existingInvoice) {
        if (existingInvoice) {
          // Override expiration time of the existing invoice
          if (invoice.expiration) {
            existingInvoice.expiration = invoice.expiration;
          }
          return baronDb.insert(existingInvoice, callback);
        }
        else { cb(); }
      });
    },
    function(cb) {
      // Create New Invoice
      invoice.api_key = undefined;
      invoice.created = new Date().getTime();
      invoice.type = 'invoice';
      var balanceDue = new BigNumber(0);
      invoice.line_items.forEach(function(item) {
        var lineCost = new BigNumber(item.amount).times(item.quantity);
        balanceDue = balanceDue.plus(lineCost);
      });
      invoice.balance_due = Number(balanceDue.valueOf());
      baronDb.insert(invoice, cb);
    },
  ], function (err, result) {
    callback(err, result);
  });
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
  findMatchingMetadataId: findMatchingMetadataId,
  findPaymentById: findPaymentById,
  findPayments: findPayments,
  findPaymentsByTxId: findPaymentsByTxId,
  findInvoice: findInvoice,
  getWatchedPayments: getWatchedPayments,
  getPaymentByBlockHash: getPaymentByBlockHash,
  getLastKnownBlockHash: getLastKnownBlockHash,
  createInvoice: createInvoice,
  getWebhooks: getWebhooks,
  insert: insert,
  destroy: destroy
};
