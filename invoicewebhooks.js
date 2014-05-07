var request = require('request');
var crypto = require('crypto');
var db = require(__dirname + '/db');

function generatePostToken(token) {
  return crypto.createHash('sha1').update(token).digest('hex');
}

function generateHandshakeToken(postToken, token) {
  var toHash = postToken + token;
  return crypto.createHash('sha1').update(toHash).digest('hex');
}

function postToWebhook(webhookObj, cb) {
  var postToken = generatePostToken(webhookObj.token);
  var handshakeToken = generateHandshakeToken(postToken, webhookObj.token);
  console.log('[Webhook: ' + webhookObj.invoice_id + '] Calling webhook ' + webhookObj.url);
  request.post(webhookObj.url, { form: { token: postToken } },
    function (error, response, body) {
      try {
        body = JSON.parse(body);
        var receivedHandshakeToken = body.token;
        var handshakeSuccess = handshakeToken === receivedHandshakeToken;
        if (!error && handshakeSuccess && response.statusCode === 200) {
          cb();
        }
        else {
          if (!handshakeSuccess) {
            console.log('[Webhook Handshake Failed: ' + webhookObj.invoice_id + '] handshake between baron and webhook failed.');
          }
          error = error ? error : new Error();
          cb(error);
        }
      }
      catch(e) {
        cb(e);
      }
    }
  );
}

function postToWebhookStoreFailure(webhookObj) {
  postToWebhook(webhookObj, function(err) {
    if (err) {
      webhookObj.created = new Date().getTime();
      webhookObj.type = 'webhook';
      db.insert(webhookObj, function(err) {
        if (err) {
          console.log('[Webhook Storage: ' + webhookObj.invoice_id + '] failed to store webhook for retry: \n' + JSON.stringify(webhookObj));
        }
        else {
          console.log('[Webhook Failed: ' + webhookObj.invoice_id + '] failed to notify ' + webhookObj.url);
        }
      });
    }
    else {
        console.log('[Webhook Success: ' + webhookObj.invoice_id + '] successfully notified ' + webhookObj.url);
    }
  });
}

var postToWebhookIgnoreFailure = function(webhookObj, cb) {
  postToWebhook(webhookObj, function(err) {
    if (err) {
        console.log('[Webhook Retry Failed: ' + webhookObj.invoice_id + '] failed to notify ' + webhookObj.url);
        cb();
    }
    else {
        db.destroy(webhookObj._id, webhookObj._rev, function(err) {
          if (err) {
            console.log('[Webhook Destroy Failed: ' + webhookObj.invoice_id + '] failed to destroy ' + JSON.stringify(webhookObj));
          }
        });
        console.log('[Webhook Retry Success: ' + webhookObj.invoice_id + '] successfully notified ' + webhookObj.url);
        cb();
    }
  });
};

function tryCallPaid(webhooks, invoiceId, newStatus) {
  if (webhooks && webhooks.paid && webhooks.paid.url && webhooks.paid.token) {
    webhooks.paid.status = newStatus;
    webhooks.paid.invoice_id = invoiceId;
    postToWebhookStoreFailure(webhooks.paid);
  }
}

function tryCallPartial(webhooks, invoiceId, newStatus) {
  if (webhooks && webhooks.partial && webhooks.partial.url && webhooks.partial.token) {
    webhooks.partial.status = newStatus;
    webhooks.partial.invoice_id = invoiceId;
    postToWebhookStoreFailure(webhooks.partial);
  }
}

function tryCallPending(webhooks, invoiceId, newStatus) {
  if (webhooks && webhooks.pending && webhooks.pending.url && webhooks.pending.token) {
    webhooks.pending.status = newStatus;
    webhooks.pending.invoice_id = invoiceId;
    postToWebhookStoreFailure(webhooks.pending);
  }
}

function tryCallInvalid(webhooks, invoiceId, newStatus) {
  if (webhooks && webhooks.invalid && webhooks.invalid.url && webhooks.invalid.token) {
    webhooks.invalid.status = newStatus;
    webhooks.invalid.invoice_id = invoiceId;
    postToWebhookStoreFailure(webhooks.invalid);
  }
}

var determineWebhookCall = function(invoiceId, origStatus, newStatus) {
  if (origStatus !== newStatus) {
    db.findInvoice(invoiceId, function(err, invoice) {
      if (err) {
        console.log('[Webhooks (' + invoiceId + ')] Error finding invoice.');
      }
      else if (invoice.webhooks) {
        switch(newStatus) {
          case 'invalid':
            tryCallInvalid(invoice.webhooks, invoiceId, newStatus);
            break;
          case 'pending':
            tryCallPending(invoice.webhooks, invoiceId, newStatus);
            break;
          case 'partial':
            tryCallPartial(invoice.webhooks, invoiceId, newStatus);
            break;
          case 'paid':
          case 'overpaid':
            tryCallPaid(invoice.webhooks, invoiceId, newStatus);
            break;
          default: break;
        }
      }
    });
  }
};

module.exports = {
  postToWebhookIgnoreFailure: postToWebhookIgnoreFailure,
  determineWebhookCall: determineWebhookCall
};