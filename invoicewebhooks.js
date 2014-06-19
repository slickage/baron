var request = require('request');
var db = require(__dirname + '/db');

function postToWebhook(webhookObj, cb) {
  //console.log('[Webhook: ' + webhookObj.invoice_id + '] Calling webhook ' + webhookObj.url);
  var postData = {};
  postData.token = webhookObj.token;
  if (webhookObj.metadata) {
    postData.metadata = webhookObj.metadata;
  }
  var form = { form: postData };
  request.post(webhookObj.url, { form: postData },
    function (error, response) {
      try {
        if (!error && response.statusCode === 200) {
          cb();
        }
        else {
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

function tryCallPaid(invoice, invoiceId, newStatus) {
  var webhooks = invoice.webhooks;
  if (webhooks && webhooks.paid && webhooks.paid.url && webhooks.token) {
    webhooks.paid.status = newStatus;
    webhooks.paid.invoice_id = invoiceId;
    webhooks.paid.token = webhooks.token;
    webhooks.paid.metadata = invoice.metadata;
    postToWebhookStoreFailure(webhooks.paid);
  }
}

function tryCallPartial(invoice, invoiceId, newStatus) {
  var webhooks = invoice.webhooks;
  if (webhooks && webhooks.partial && webhooks.partial.url && webhooks.token) {
    webhooks.partial.status = newStatus;
    webhooks.partial.invoice_id = invoiceId;
    webhooks.partial.token = webhooks.token;
    webhooks.partial.metadata = invoice.metadata;
    postToWebhookStoreFailure(webhooks.partial);
  }
}

function tryCallPending(invoice, invoiceId, newStatus) {
  var webhooks = invoice.webhooks;
  if (webhooks && webhooks.pending && webhooks.pending.url && webhooks.token) {
    webhooks.pending.status = newStatus;
    webhooks.pending.invoice_id = invoiceId;
    webhooks.pending.token = webhooks.token;
    webhooks.pending.metadata = invoice.metadata;
    postToWebhookStoreFailure(webhooks.pending);
  }
}

function tryCallInvalid(invoice, invoiceId, newStatus) {
  var webhooks = invoice.webhooks;
  if (webhooks && webhooks.invalid && webhooks.invalid.url && webhooks.token) {
    webhooks.invalid.status = newStatus;
    webhooks.invalid.invoice_id = invoiceId;
    webhooks.invalid.token = webhooks.token;
    webhooks.invalid.metadata = invoice.metadata;
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
            tryCallInvalid(invoice, invoiceId, newStatus);
            break;
          case 'pending':
            tryCallPending(invoice, invoiceId, newStatus);
            break;
          case 'partial':
            tryCallPartial(invoice, invoiceId, newStatus);
            break;
          case 'paid':
          case 'overpaid':
            tryCallPaid(invoice, invoiceId, newStatus);
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
