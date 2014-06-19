var reloadPayment = function (queryUrl, expiration) {
  var statusBanner = document.getElementById('status-banner');
  var statusBannerText = document.getElementById('status-banner-text');
  var addressInputs = document.getElementsByClassName('address-input');
  var expirationTextSpans = document.getElementsByClassName('expiration-text');
  var confirmationSpans = document.getElementsByClassName('confirmations');
  var qrCodeDivs = document.getElementsByClassName('qrcode');
  var sentTextSpans = document.getElementsByClassName('sent-text');
  var statusTextSpans = document.getElementsByClassName('status-text');
  var amountSpan = document.getElementsByClassName('amount-text');
  var refreshLinkSpans = document.getElementsByClassName('refresh-link');
  var infoLinkSpans = document.getElementsByClassName('info-link');

  var requestLocked = false;

  var confirmations, status, qrImageUrl, amount, chainExplorerUrl, address;

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

  var requestPayment = function() {
    if (requestLocked) {
      return;
    }
    requestLocked = true;
    var request = new XMLHttpRequest();
    var isAsynchronous = true;
    request.open('GET', queryUrl, isAsynchronous);
    request.onload = function(){
      var payment = JSON.parse(request.response);
      if (payment.stack) {
        return location.reload();
      }
      updatePaymentData(payment);
      requestLocked = false;
    };
    request.send();
  };

  String.prototype.repeat = function(n){
    n = n || 0;
    var s = '', i;
    for (i = 0; i < n; i++) {
      s += this;
    }
    return s;
  };

  if (expirationTextSpans && expirationTextSpans.length > 0) {
    var ellipsis = '';
    setInterval(function(){
      if (chainExplorerUrl) {
        expirationTextSpans.item(0).innerText = '';
        expirationTextSpans.item(1).innerText = expirationTextSpans.item(0).innerText;
        return clearInterval(this);
      }
      var curTime = new Date().getTime();
      if (expiration <= curTime){
        if (ellipsis.length >= 3) {
          ellipsis = '';
        }

        ellipsis = '.'.repeat(ellipsis.length + 1);
        expirationTextSpans.item(0).innerText = 'Fetching new exchange rate' + ellipsis;
        expirationTextSpans.item(1).innerText = expirationTextSpans.item(0).innerText;
        requestPayment();
      }
      else {
        expirationTextSpans.item(0).innerText = 'Payment rate will refresh in ' +
          getExpirationCountDown(expiration) + '.';
        expirationTextSpans.item(1).innerText = expirationTextSpans.item(0).innerText;
      }
    }, 1000);
  }

  var updatePaymentData = function(payment) {
    var newStatus = payment.status;
    var newConfirmations = payment.confirmations;
    var newQrImageUrl = payment.qrImageUrl;
    var newAddress = payment.address;
    var newAmount = payment.amount;
    var newExpiration =  payment.expireTime;
    var newChainExplorerUrl = payment.chainExplorerUrl;

    // Update Info/Refresh Link
    if (newChainExplorerUrl && newChainExplorerUrl !== chainExplorerUrl) {
      chainExplorerUrl = newChainExplorerUrl;
      Array.prototype.forEach.call(infoLinkSpans, function(span) {
        span.innerHTML = '<a target="_blank" href="' + newChainExplorerUrl +
          '"><img class="right-icon" src="/images/info.png" /></a>';
      });
      Array.prototype.forEach.call(refreshLinkSpans, function(span) {
        span.innerHTML = '';
      });
      Array.prototype.forEach.call(qrCodeDivs, function(div) {
        div.innerHTML = '';
      });
    }

    // Update Address
    if (newAddress && newAddress !== address) {
      Array.prototype.forEach.call(addressInputs, function(input) {
        input.value = newAddress;
      });
    }

    // Update Expiration
    if (expiration && newExpiration !== expiration) {
      expiration = newExpiration;
      expirationTextSpans.item(0).innerText = 'Payment rate will refresh in ' +
        getExpirationCountDown(expiration) + '.';
      expirationTextSpans.item(1).innerText = expirationTextSpans.item(0).innerText;
    }

    // Update Amount
    if (newAmount && newAmount !== amount) {
      amount = newAmount;
      Array.prototype.forEach.call(amountSpan, function(span) {
        var amountText;
        if (payment.amountLastFour === '0000') {
          amountText = payment.amountFirstFour + ' BTC';
        }
        else {
          amountText = payment.amountFirstFour + '<span class="gray">' + payment.amountLastFour + '</span> BTC';
        }
        span.innerHTML = amountText;
      });
    }

    // Update QRCode
    Array.prototype.forEach.call(qrCodeDivs, function(div) {
      if (newQrImageUrl && newQrImageUrl !== qrImageUrl) {
        qrImageUrl = newQrImageUrl;
        div.innerHTML = '<a href="' + payment.bitcoinUrl + '"><img width="320" height="320" src="' + payment.qrImageUrl + '" alt="" title="" /></a>';
      }
    });

    // Update Confirmations
    if (newConfirmations && newConfirmations !== confirmations) {
      confirmations = newConfirmations;
      Array.prototype.forEach.call(confirmationSpans, function(span) {
        span.innerText = newConfirmations;
      });
    }

    // Update Status
    if (newStatus && newStatus !== status) {
      status = newStatus;
      Array.prototype.forEach.call(statusTextSpans, function(span) {
        span.className = 'status-text ' + newStatus;
        var newStatusText;
        var statusBannerDisplay = 'none';
        var sentTextDisplay = 'none';
        if (newStatus === 'pending') {
          sentTextDisplay = 'inline-block';
          newStatusText = 'Payment is Pending';
        }
        else if (newStatus === 'unpaid') {
          newStatusText = 'Balance is Unpaid';
        }
        else if (newStatus === 'paid') {
          sentTextDisplay = 'inline-block';
          statusBannerDisplay = 'block';
          statusBannerText.innerHTML = 'Invoice has been paid in full.';
          newStatusText = 'Balance is Paid';
        }
        else if (newStatus === 'partial') {
          sentTextDisplay = 'inline-block';
          newStatusText = 'Balance is Underpaid';
        }
        else if (newStatus === 'overpaid') {
          sentTextDisplay = 'inline-block';
          statusBannerDisplay = 'block';
          statusBannerText.innerHTML = 'Invoice has been <strong>overpaid</strong>.';
          newStatusText = 'Balance is Overpaid';
        }
        else if (newStatus === 'expired') {
          newStatusText = 'Payment is Expired';
        }
        else {
          sentTextDisplay = 'inline-block';
          newStatusText = 'Payment is Invalid';
        }
        statusBanner.style.display = statusBannerDisplay;
        if (sentTextDisplay === 'inline-block') {
          Array.prototype.forEach.call(sentTextSpans, function(span) {
            span.style.display = sentTextDisplay;
          });
        }
        span.innerText = newStatusText;
      });
    }
  };

  setInterval(function() {
    requestPayment();
  }, 15000);
};