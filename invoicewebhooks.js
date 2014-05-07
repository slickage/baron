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
  var webhookInfo = webhookObj.invoice_id + ', ' + webhookObj.status + ', '+ webhookObj.url;
  console.log('> [Webhook (' + webhookInfo + ')] attempting to call webhook');
  request.post(webhookObj.url, { form: { token: postToken } },
    function (error, response, body) {
      body = JSON.parse(body);
      var receivedHandshakeToken = body.token;
      var handshakeSuccess = handshakeToken === receivedHandshakeToken;
      if (!error && handshakeSuccess && response.statusCode === 200) {
        db.destroy(webhookObj._id, webhookObj._rev, function(err) {
          if (err) {
            console.log('> [Webhook (' + webhookInfo + ')] failed to destroy ' + JSON.stringify(webhookObj));
          }
          else {
            console.log('> [Webhook (' + webhookInfo + ')] webhook successfully called');
          }
          cb();
        });
      }
      else {
        if (!handshakeSuccess) {
          console.log('> [Webhook (' + webhookInfo + ')] handshake between baron and webhook url failed');
        }
        else {
          console.log('> [Webhook (' + webhookInfo + ')] failed to notify');
        }
        cb();
      }
    }
  );
}

function addWebhookToQueue(webhookObj) {
  var webhookInfo = webhookObj.invoice_id + ', ' + webhookObj.status + ', '+ webhookObj.url;
  db.getWebHooksByInvoiceId(webhookObj.invoice_id, function(err, webhooksArr) {
    if (err) {
      console.log('> [Webhook (' + webhookInfo + ')] Error querying webhooks');
    }
    else {
      var duplicate = false;
      if (webhooksArr) {
        webhooksArr.forEach(function(webhook) {
          if (webhookObj.status === webhook.status) {
            duplicate = true;
          }
        });
      }

      if (!duplicate) {
        webhookObj.created = new Date().getTime();
        webhookObj.type = 'webhook';
        db.insert(webhookObj, function(err) {
          if (err) {
            console.log('> [Webhook (' + webhookInfo + ')] Failed to queue webhook: \n' + JSON.stringify(webhookObj));
          }
          else {
            console.log('> [Webhook (' + webhookInfo + ')] Queued for execution');
          }
        });
      }
    }
  });
}

var queuePaid = function(webhooks, invoiceId, origStatus, newStatus) {
  if (origStatus !== newStatus) {
    if (webhooks && webhooks.paid && webhooks.paid.url && webhooks.paid.token) {
      webhooks.paid.status = newStatus;
      webhooks.paid.invoice_id = invoiceId;
      addWebhookToQueue(webhooks.paid);
    }
  }
};

var queuePartial = function(webhooks, invoiceId, origStatus, newStatus) {
  if (origStatus !== newStatus) {
    if (webhooks && webhooks.partial && webhooks.partial.url && webhooks.partial.token) {
      webhooks.partial.status = newStatus;
      webhooks.partial.invoice_id = invoiceId;
      addWebhookToQueue(webhooks.partial);
    }
  }
};

var queuePending = function(webhooks, invoiceId, origStatus, newStatus) {
  if (origStatus !== newStatus) {
    if (webhooks && webhooks.pending && webhooks.pending.url && webhooks.pending.token) {
      webhooks.pending.status = newStatus;
      webhooks.pending.invoice_id = invoiceId;
      addWebhookToQueue(webhooks.pending);
    }
  }
};

var queueInvalid = function(webhooks, invoiceId, origStatus, newStatus) {
  if (origStatus !== newStatus) {
    if (webhooks && webhooks.invalid && webhooks.invalid.url && webhooks.invalid.token) {
      webhooks.invalid.status = newStatus;
      webhooks.invalid.invoice_id = invoiceId;
      addWebhookToQueue(webhooks.invalid);
    }
  }
};

module.exports = {
  postToWebhook: postToWebhook,
  queuePaid: queuePaid,
  queuePartial: queuePartial,
  queuePending: queuePending,
  queueInvalid: queueInvalid
};