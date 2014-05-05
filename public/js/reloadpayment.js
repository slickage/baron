var reloadPayment = function (expiration, txId, insightUrl, blockHash, queryUrl, minConfirmations) {
    var expirationSpans = document.getElementsByClassName('expiration');
    var confirmationSpans = document.getElementsByClassName('confirmations');
    var confirmations = Number(confirmationSpans[0].innerText);
    
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

    setInterval(function(){
      for (var i = 0; i < expirationSpans.length; ++i) {
        var item = expirationSpans[i];
        var curTime = new Date().getTime();
        if(expiration < curTime){
          window.location.reload();
        }
        else {
          item.innerText = getExpirationCountDown(expiration);
        }
      }
    }, 500);

    var requestConfirmations = function() {
        var request = new XMLHttpRequest();
        var isAsynchronous = true;
        request.open('GET', insightUrl + blockHash, isAsynchronous);
        request.onload = function(xmlEvent){
          var res = JSON.parse(request.response);
          if (res && res.confirmations) {
            var newConfirmations = res.confirmations;
            if (newConfirmations === minConfirmations) {
               window.location.reload();
            }
            else if (confirmations !== newConfirmations) {
              for (var i = 0; i < confirmationSpans.length; ++i) {
                var item = confirmationSpans[i];
                item.innerText = newConfirmations;
              }
            }
          }
        };
        request.send();
    };

    var requestPayment = function() {
        var request = new XMLHttpRequest();
        var isAsynchronous = true;
        request.open('GET', queryUrl, isAsynchronous);
        request.onload = function(xmlEvent){
          var res = JSON.parse(request.response);
          var newTxId = res.tx_id;
          var newStatus = res.status;
          var newBlockHash = res.block_hash;
          if (newBlockHash) {
            blockHash = newBlockHash;
          }
          if (res && !txId && (newTxId || newStatus !== 'unpaid')) {
            window.location.reload();
          }
        };
        request.send();
    };

    setInterval(function(){
      if (!txId || !blockHash) {
        requestPayment();
      }
      else if(blockHash) {
        requestConfirmations();
      }
    }, 15000);
};