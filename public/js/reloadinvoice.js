var reloadInvoice = function(queryUrl, expiration, isPaid) {
  var requestLocked = false;
  var statusBanner = document.getElementById('status-banner');
  var statusBannerText = document.getElementById('status-banner-text');
  var payButton = document.getElementById('pay-button');
  var paymentHistoryHeader = document.getElementById('payment-history-header');
  var paymentHistoryContent = document.getElementById('payment-history-content');
  var amountPaidSpans = document.getElementsByClassName('amount-paid-text');
  var amountDueSpans = document.getElementsByClassName('amount-due-text');

  var amountDue, amountPaid;

  var getExpirationCountDown = function (expiration) {
    var curTime = new Date().getTime();
    var diff = expiration - curTime;
    var days = Math.floor(diff / 1000 / 60 / 60 / 24);
    diff -= days * 1000 * 60 * 60 * 24;
    var hours = Math.floor(diff / 1000 / 60 / 60);
    diff -= hours * 1000 * 60 * 60;
    var mins = Math.floor(diff / 1000 / 60);
    diff -= mins * 1000 * 60;
    var secs = Math.floor(diff / 1000);
    if (days === 0 && hours !== 0) {
      return hours + 'h ' + mins + 'm ' + secs + 's';
    }
    else if (days === 0 && hours === 0) {
      return mins + 'm ' + secs + 's';
    }
    else {
      return days + 'd ' + hours + 'h ' + mins + 'm ' + secs + 's';
    }
  };

  if (expiration && !isPaid) {
    var expirationInterval = setInterval(function() {
      if (isPaid) {
        return;
      }
      var curTime = new Date().getTime();
      if (expiration <= curTime && amountDue > 0) {
        clearInterval(expirationInterval);
        statusBannerText.innerText = 'Invoice is expired. Payments will no longer be accepted.';
        location.reload();
      }
      else if (amountDue <= 0) {
        statusBanner.style.display = 'none';
      }
      else {
        statusBanner.style.display = 'block';
        statusBannerText.innerText = 'Invoice will expire in ' + getExpirationCountDown(expiration) + '.';
      }
    }, 1000);
  }

  var requestInvoice = function() {
    if (requestLocked) {
      return;
    }
    requestLocked = true;
    var request = new XMLHttpRequest();
    var isAsynchronous = true;
    request.open('GET', queryUrl, isAsynchronous);
    request.onload = function() {
      var invoice = JSON.parse(request.response);
      updateInvoiceData(invoice);
      requestLocked = false;
    };
    request.send();
  };

  var buildPaymentHistory = function(paymentHistory) {
    if (paymentHistory.length > 0) {
      paymentHistoryHeader.style.display = 'block';
    }
    paymentHistoryContent.innerHTML = '';
    paymentHistory.forEach(function(payment) {
      var paymentTx = payment.txid.substring(0, 25) + '...';
      var amountPaid = payment.amount_paid ? payment.amount_paid + ' BTC' : 0;
      var paymentAmount = payment.amount_usd ? payment.amount_usd + ' USD<br />(' + amountPaid + ')' : amountPaid;
      var paymentHtml =
        '<div class="row line-item thin-underline">' +
          '<div class="col-xs-12 col-sm-5 col-md-4">' +
            '<span class="visible-xs mobile-address-text">' +
              '<a target="_blank" href="' + payment.url + '">' +
                paymentTx +
              '</a>' +
            '</span>' +
            '<span class="hidden-xs address-text">' +
              '<a target="_blank" href="' + payment.url + '">' +
                paymentTx +
              '</a>' +
            '</span>' +
          '</div>' +
          '<div class="col-xs-3 visible-xs mobile-lbl-text">Status</div>' +
          '<div class="col-xs-9 col-sm-2 col-md-3 right ' + payment.status.toLowerCase()+ '">' +
            payment.status +
          '</div>' +
          '<div class="col-xs-3 visible-xs mobile-lbl-text">Amount</div>' +
          '<div class="col-xs-9 col-sm-5 col-md-5 right">' +
            paymentAmount +
          '</div>' +
        '</div>';
      
      if (payment.reorg_history) {
        payment.reorg_history.forEach(function(blockHash) {
          paymentHtml = paymentHtml +
            '<div class="row indent line-item thin-underline">' +
              '<div class="col-xs-12 xsmall-text">' +
                '<span class="red">Payment was reorged from block: </span>' +
                blockHash +
              '</div>' +
            '</div>';
        });
      }

      if (payment.status.toLowerCase() === 'invalid' && payment.double_spent_history) {
        payment.double_spent_history.forEach(function(txId) {
          paymentHtml = paymentHtml +
            '<div class="row indent line-item thin-underline">' +
              '<div class="col-xs-12 xsmall-text">' +
                '<span class="red">Payment was double spent by transaction: </span>' +
                txId +
              '</div>' +
            '</div>';
        });
      }
      paymentHistoryContent.innerHTML = paymentHistoryContent.innerHTML + paymentHtml;
    });
  };

  var updateInvoiceData = function(invoice) {
    isPaid = invoice.is_paid;
    var newAmountPaid = invoice.total_paid;
    var newAmountDue = invoice.remaining_balance;
    var newPaymentHistory = invoice.payment_history;

    // Update Status Banner
    if (isPaid) {
      statusBannerText.className = 'col-sm-12 alert xsmall-text alert-box alert-success';
      statusBanner.style.display = 'block';
      if (invoice.is_overpaid) {
        statusBannerText.innerHTML = 'Invoice has been <strong>overpaid</strong>.';
      }
      else {
        statusBannerText.innerText = 'Invoice has been paid in full.';
      }
    }

    // Update Amount Paid
    if (newAmountPaid !== undefined && newAmountPaid !== amountPaid) {
      amountPaid = newAmountPaid;
      Array.prototype.forEach.call(amountPaidSpans, function(span) {
        span.innerText = newAmountPaid;
      });
    }

    // Update Amount Due
    if (newAmountDue !== undefined && newAmountDue !== amountDue) {
      if (newAmountDue <= 0) {
        payButton.style.display = 'none';
      }
      else {
        payButton.style.display = 'block';
      }
      Array.prototype.forEach.call(amountDueSpans, function(span) {
        span.innerText = newAmountDue;
      });
      amountDue = newAmountDue;
    }

    // Update Payment History
    if (newPaymentHistory) {
      buildPaymentHistory(newPaymentHistory);
    }
  };

  setInterval(function() {
    requestInvoice();
  }, 15000);
};