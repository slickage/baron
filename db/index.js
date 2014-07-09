/* jshint node: true */
'use strict';

var rootDir = __dirname + '/../';
var log = require(rootDir + '/log');
var validate = require(rootDir + 'lib/validate');
var config = require(rootDir + 'config');
var helper = require(rootDir + 'lib/helper');
var ddoc = require(__dirname + '/ddoc');
var async = require('async');
var BigNumber = require('bignumber.js');
var sanitizeHtml = require('sanitize-html');
var dbName = config.couchdb.name;
var nano, baronDb;

// Increment when model changes in an incompatible way
var currentDbVersion = 1;

var getCouchUrl = function() {
  var credentials = '';
  if (config.couchdb.user && config.couchdb.pass) {
    credentials = encodeURIComponent(config.couchdb.user) + ':' + encodeURIComponent(config.couchdb.pass) + '@';
  }
  var couchUrl = config.couchdb.proto + "://" + credentials + config.couchdb.host;
  return couchUrl;
};

var checkDbVersion = function(cb) {
  baronDb.get('db_version', function(err, dbVersionObj) {
    if (!err) {
      if (dbVersionObj.version !== currentDbVersion) {
        // Upgrade needed
        log.warn('Baron Database Requires Upgrade.');
        // TODO: Replace with db conversion function
        process.exit(255);
      }
      else {
        log.info('Baron Database version ' + dbVersionObj.version);
        cb();
      }
    }
    else {
      if (err.reason && err.reason === 'missing' || err.reason === 'deleted' ) {
        // insert
        dbVersionObj = {};
        dbVersionObj._id = 'db_version';
        dbVersionObj.version = currentDbVersion;
        baronDb.insert(dbVersionObj, function() {
          log.info('Baron Database version ' + dbVersionObj.version);
          cb();
        });
      }
      else {
        // FATAL other error
        log.fatal(err, 'checkDbVersion Fatal Error');
        process.exit(1);
      }
    }
  });
};

var instantiateDb = function (cb) {
  nano = require('nano')(getCouchUrl());
  nano.db.get(dbName, function(err) {
    if (err) {
      if (err.error === 'unauthorized') {
        log.error(err, 'CouchDB credentials are invalid. Attempted connection with credentials [' + config.couchdb.user + ':' + config.couchdb.pass + ']');
        return process.exit(1);
      }
      else if (err.code && err.code === 'ECONNREFUSED') {
        log.error(err, 'CouchDB connection refused at ' + config.couchdb.host);
        return process.exit(1);
      }
      else if (err.reason && err.reason === 'no_db_file') {
        nano.db.create(dbName, function(err) {
          if (err) {
            log.error(err, 'Failed to create database');
            return process.exit(1);
          }
          else {
            log.info('Database created.');
            baronDb = nano.use(dbName);
            baronDb.insert(ddoc, function(err) {
              if (err) {
                log.error(err, 'Failed to push design document');
                return process.exit(1);
              }
              else {
                cb();
              }
            });
          }
        });
      }
      else {
        log.error(err, 'instantiateDb error');
        return process.exit(1);
      }
    }
    else {
      baronDb = nano.use(dbName);
      checkDbVersion(cb);
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

var getLatestPaymentWithBlockHash = function(cb) {
  var filter = {
    limit: 1,
    descending: true,
    startkey: {},
    endkey: null
  };
  baronDb.view(dbName, 'paidPaymentsByTime', filter, function(err, body) {
    if (!err && body.rows && body.rows.length > 0) {
      var latestPaymentWithBlockhash = body.rows[0].value;
      return cb(err, latestPaymentWithBlockhash);
    }
    else {
      return cb(err, null);
    }
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
      validate.invoice(invoice, function(err) {
        if (err) {
          cb(err, null);
        }
        else { cb(); }
      });
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
      invoice._id = helper.pseudoRandomHex(32);
      invoice.api_key = undefined;
      invoice.created = new Date().getTime();
      invoice.type = 'invoice';
      var invoiceTotal = new BigNumber(0);
      invoice.line_items.forEach(function(item) {
        var lineCost = new BigNumber(item.amount).times(item.quantity);
        invoiceTotal = invoiceTotal.plus(lineCost);
      });
      var isUSD = invoice.currency.toUpperCase() === 'USD';
      var discountTotal = new BigNumber(0);
      if (invoice.discounts) {
        invoice.discounts.forEach(function(item) {
          var roundedAmount = 0;
          if (item.amount) {
            roundedAmount = isUSD ? helper.roundToDecimal(item.amount, 2) : item.amount;
          }
          else if (item.percentage) {
            var percentage = new BigNumber(item.percentage).dividedBy(100);
            var discountAmount = Number(invoiceTotal.times(percentage).valueOf());
            roundedAmount = isUSD ? helper.roundToDecimal(discountAmount, 2) : discountAmount;
          }
          discountTotal = discountTotal.plus(roundedAmount);
        });
      }
      invoiceTotal = invoiceTotal.minus(discountTotal);
      invoice.invoice_total = Number(invoiceTotal.valueOf());
      invoice.invoice_total = isUSD ? helper.roundToDecimal(invoice.invoice_total, 2) : Number(invoice.invoice_total);
      if (invoice.text) {
        invoice.text = sanitizeHtml(invoice.text); // remove hostile elements
      }
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
  getCouchUrl: getCouchUrl,
  instantiateDb: instantiateDb,
  findInvoiceAndPayments: findInvoiceAndPayments,
  findMatchingMetadataId: findMatchingMetadataId,
  findPaymentById: findPaymentById,
  findPayments: findPayments,
  findPaymentsByTxId: findPaymentsByTxId,
  findInvoice: findInvoice,
  getWatchedPayments: getWatchedPayments,
  getPaymentByBlockHash: getPaymentByBlockHash,
  getLatestPaymentWithBlockHash: getLatestPaymentWithBlockHash,
  createInvoice: createInvoice,
  getWebhooks: getWebhooks,
  insert: insert,
  destroy: destroy
};
