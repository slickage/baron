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

var tryCallPaid = function(webhooks, invoiceId, origStatus, newStatus) {
  if (origStatus !== newStatus) {
    if (webhooks && webhooks.paid && webhooks.paid.url && webhooks.paid.token) {
      webhooks.paid.status = newStatus;
      webhooks.paid.invoice_id = invoiceId;
      postToWebhookStoreFailure(webhooks.paid);
    }
  }
};

var tryCallPartial = function(webhooks, invoiceId, origStatus, newStatus) {
  if (origStatus !== newStatus) {
    if (webhooks && webhooks.partial && webhooks.partial.url && webhooks.partial.token) {
      webhooks.partial.status = newStatus;
      webhooks.partial.invoice_id = invoiceId;
      postToWebhookStoreFailure(webhooks.partial);
    }
  }
};

var tryCallPending = function(webhooks, invoiceId, origStatus, newStatus) {
  if (origStatus !== newStatus) {
    if (webhooks && webhooks.pending && webhooks.pending.url && webhooks.pending.token) {
      webhooks.pending.status = newStatus;
      webhooks.pending.invoice_id = invoiceId;
      postToWebhookStoreFailure(webhooks.pending);
    }
  }
};

var tryCallInvalid = function(webhooks, invoiceId, origStatus, newStatus) {
  if (origStatus !== newStatus) {
    if (webhooks && webhooks.invalid && webhooks.invalid.url && webhooks.invalid.token) {
      webhooks.invalid.status = newStatus;
      webhooks.invalid.invoice_id = invoiceId;
      postToWebhookStoreFailure(webhooks.invalid);
    }
  }
};

module.exports = {
  postToWebhookIgnoreFailure: postToWebhookIgnoreFailure,
  tryCallPaid: tryCallPaid,
  tryCallPartial: tryCallPartial,
  tryCallPending: tryCallPending,
  tryCallInvalid: tryCallInvalid
};