var assert = require('assert');
var helper = require(__dirname + '/../helper');

describe('helper', function() {
  describe('#decialPlaces', function() {
    it('should calculate decimal place count of provided number', function() {
      assert.equal(0, helper.decimalPlaces(1));
      assert.equal(1, helper.decimalPlaces(1.1));
      assert.equal(2, helper.decimalPlaces(1.12));
      assert.equal(3, helper.decimalPlaces(1.123));
      assert.equal(4, helper.decimalPlaces(1.1234));
      assert.equal(5, helper.decimalPlaces(1.12345));
      assert.equal(6, helper.decimalPlaces(1.123456));
      assert.equal(7, helper.decimalPlaces(1.1234567));
      assert.equal(8, helper.decimalPlaces(1.12345678));
    });
  });
});

describe('helper', function() {
  describe('#toFourDecimals', function() {
    it('should return the provided number truncated to four decimal places', function() {
      assert.equal(11.1234, helper.toFourDecimals(11.1234));
      assert.equal(45.4321, helper.toFourDecimals(45.4321));
      assert.equal(12.3231, helper.toFourDecimals(12.3231));
      assert.equal(5.0123, helper.toFourDecimals(5.0123));

      assert.equal('1.0000', helper.toFourDecimals(1).toString());
      assert.equal('2.1000', helper.toFourDecimals(2.1).toString());
      assert.equal('0.1200', helper.toFourDecimals(0.12).toString());
      assert.equal('4.1230', helper.toFourDecimals(4.123).toString());
      assert.equal('7.0000', helper.toFourDecimals(7.00009).toString());
    });
  });
});

describe('helper', function() {
  describe('#getLastFourDecimals', function() {
    it('should return last 4 digits assuming number has eight decimal places', function() {
      assert.equal(4321, helper.getLastFourDecimals(11.12344321));
      assert.equal(5234, helper.getLastFourDecimals(45.43215234));
      assert.equal(1234, helper.getLastFourDecimals(12.32311234));
      assert.equal(6123, helper.getLastFourDecimals(5.01236123));

      assert.equal('0000', helper.getLastFourDecimals(5).toString());
      assert.equal('1000', helper.getLastFourDecimals(6.00001000).toString());
      assert.equal('3200', helper.getLastFourDecimals(3.121332).toString());
      assert.equal('0001', helper.getLastFourDecimals(2.00000001).toString());
    });
  });
});


describe('helper', function() {
  describe('#roundToDecimal', function() {
    it('should round number to specified decimal place', function() {
      assert.equal(5.12, helper.roundToDecimal(5.123, 2));
      assert.equal(45.43215234, helper.roundToDecimal(45.43215234, 8));
      assert.equal(1.1234, helper.roundToDecimal(1.1234, 4));
      assert.equal(1.124, helper.roundToDecimal(1.12351, 3));

      assert.equal('5.00', helper.roundToDecimal(5, 2).toString());
      assert.equal('0.000000', helper.roundToDecimal(0, 6).toString());
      assert.equal('3.12130', helper.roundToDecimal(3.121302, 5).toString());
      assert.equal('2.0000001', helper.roundToDecimal(2.0000001, 7).toString());
    });
  });
});

describe('helper', function() {
  describe('#getReceiveDetail', function() {
    it('should return the receive detail portion of an object', function() {
      var transaction = {
        details: [
          { category: 'send' },
          { category: 'receive' }
        ]
      };
      assert.equal(transaction.details[1], helper.getReceiveDetail(transaction.details));
    });
  });
});

// Probably need to remove this test due to reliance on timestamp
describe('helper', function() {
  describe('#getExpirationCountDown', function() {
    it('should return expiration time string given a epoch timestamp', function() {
      var curTime = new Date().getTime() + 120500;
      assert.equal('2m 0s', helper.getExpirationCountDown(curTime));
    });
  });
});

describe('helper', function() {
  describe('#getPaymentStatus', function() {
    it('should return the status of a payment', function() {
      var payment = { 'status': 'unpaid', 'expected_amount': 0.5, 'amount_paid': 0.5 };
      var invoice = { 'min_confirmations': 4, 'currency': 'BTC' };
      assert.equal('pending' , helper.getPaymentStatus(payment, 2, invoice));
      assert.equal('paid' , helper.getPaymentStatus(payment, 4, invoice));
      assert.equal('invalid' , helper.getPaymentStatus(payment, -1, invoice));

      payment = { 'status': 'unpaid', 'expected_amount': 0.5, 'amount_paid': 0 };
      invoice = { 'min_confirmations': 2, 'currency': 'BTC' };
      assert.equal('unpaid' , helper.getPaymentStatus(payment, undefined, invoice));

      payment = { 'status': 'unpaid', 'expected_amount': 0.5, 'amount_paid': 0.6 };
      invoice = { 'min_confirmations': 2, 'currency': 'BTC' };
      assert.equal('overpaid' , helper.getPaymentStatus(payment, 3, invoice));

      payment = { 'status': 'unpaid', 'expected_amount': 0.5, 'amount_paid': 0.2};
      invoice = { 'min_confirmations': 2, 'currency': 'BTC' };
      assert.equal('pending' , helper.getPaymentStatus(payment, undefined, invoice));
      assert.equal('partial' , helper.getPaymentStatus(payment, 2, invoice));

      payment = { 'status': 'unpaid', 'expected_amount': 50.00, 'amount_paid': 50.00, 'spot_rate': 2 };
      invoice = { 'min_confirmations': 4, 'currency': 'USD' };
      assert.equal('paid' , helper.getPaymentStatus(payment, 4, invoice));
    });
  });
});