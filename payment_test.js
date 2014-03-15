var payments = require('./payments');

payments.getPaymentAddress(function(err, address) {
  var paymentAddress = 'bitcoin:' + address;
  console.log(paymentAddress);
})

