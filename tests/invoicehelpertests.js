var assert = require('assert');
var invoiceHelper = require(__dirname + '/../invoicehelper');

describe('invoicehelper', function() {
  describe('#calculateLineTotals', function() {
    it('should calculate line totals given quantity and amount', function() {
      var invoiceBTC = {
        currency: 'BTC',
        line_items: [
          { quantity: 2, amount: 0.5 },
          { quantity: 402, amount: 0.25 },
          { quantity: 14, amount: 0.3 },
          { quantity: 22, amount: 0.555555 }
        ]
      };
      invoiceHelper.calculateLineTotals(invoiceBTC);
      assert.equal('1', invoiceBTC.line_items[0].line_total.toString());
      assert.equal('100.5', invoiceBTC.line_items[1].line_total.toString());
      assert.equal('4.2', invoiceBTC.line_items[2].line_total.toString());
      assert.equal('12.22221', invoiceBTC.line_items[3].line_total.toString());

      var invoiceUSD = {
        currency: 'USD',
        line_items: [
          { quantity: 2, amount: 51.42 },
          { quantity: 402, amount: 12.25 },
          { quantity: 14, amount: 4 },
          { quantity: 22, amount: 1923.24 }
        ]
      };
      invoiceHelper.calculateLineTotals(invoiceUSD);
      assert.equal('102.84', invoiceUSD.line_items[0].line_total.toString());
      assert.equal('4924.50', invoiceUSD.line_items[1].line_total.toString());
      assert.equal('56.00', invoiceUSD.line_items[2].line_total.toString());
      assert.equal('42311.28', invoiceUSD.line_items[3].line_total.toString());
    });
  });
});

describe('invoicehelper', function() {
  describe('#getActivePayment', function() {
    it('should return payment with latest creation date', function() {
      var curTime = new Date().getTime();
      var newestPayment = { created: (curTime + 1000) };
      var payments = [ { created: curTime }, newestPayment, { created: (curTime - 1000)}];
      assert.equal(newestPayment, invoiceHelper.getActivePayment(payments));
    });
  });
});

describe('invoicehelper', function() {
  describe('#getTotalPaid', function() {
    it('should calculate the total amount paid', function() {
      var curTime = new Date().getTime();
      var paymentA = { status: 'partial', amount_paid: 0.4, created: (curTime - 10000) };
      var paymentB = { status: 'invalid', amount_paid: 1.5535, created: (curTime - 5000) };
      var paymentC = { status: 'paid', amount_paid: 0.2433, created: curTime };
      var paymentD = { status: 'overpaid', amount_paid: 5.123456789, spot_rate: 400, created: (curTime + 10000) };

      var invoice = { currency: 'BTC' };
      var payments = [ paymentA, paymentB, paymentC, paymentD ];
      assert.equal('5.76675679', invoiceHelper.getTotalPaid(invoice, payments).toString());

      paymentA = { status: 'partial', amount_paid: 0.4, spot_rate: 421, created: (curTime - 10000) };
      paymentB = { status: 'invalid', amount_paid: 1.5535, spot_rate: 411.23, created: (curTime - 5000) };
      paymentC = { status: 'paid', amount_paid: 0.2433, spot_rate: 415.26, created: curTime };
      paymentD = { status: 'overpaid', amount_paid: 5.123456789, spot_rate: 456.43, created: (curTime + 10000) };

      invoice = { currency: 'USD' };
      payments = [ paymentA, paymentB, paymentC, paymentD ];
      assert.equal('2607.93', invoiceHelper.getTotalPaid(invoice, payments).toString());
    });
  });
});

describe('invoicehelper', function() {
  describe('#getAmountDue', function() {
    it('should return amount due', function() {
      assert.equal('0', invoiceHelper.getAmountDue(1, 1, 'BTC').toString());
      assert.equal('0.25', invoiceHelper.getAmountDue(0.5, 0.25, 'BTC').toString());
      assert.equal('1.25', invoiceHelper.getAmountDue(1.50, 0.25, 'BTC').toString());
      assert.equal('10.5', invoiceHelper.getAmountDue(10.750000003, 0.25, 'BTC').toString());

      assert.equal('0.00', invoiceHelper.getAmountDue(1, 1, 'USD').toString());
      assert.equal('0.25', invoiceHelper.getAmountDue(0.5, 0.25, 'USD').toString());
      assert.equal('1.25', invoiceHelper.getAmountDue(1.50, 0.25, 'USD').toString());
      assert.equal('10.50', invoiceHelper.getAmountDue(10.750000003, 0.25, 'USD').toString());
    });
  });
});

describe('invoicehelper', function() {
  describe('#getPaymentHistory', function() {
    it('should return payment history array [everything but unpaid payments]', function() {
      var curTime = new Date().getTime();
      var paymentA = { status: 'partial', tx_id: 1, amount_paid: 0.4, created: (curTime - 10000) };
      var paymentB = { status: 'invalid', tx_id: 2, amount_paid: 1.5535, created: (curTime - 5000) };
      var paymentC = { status: 'unpaid', tx_id: null, amount_paid: 0.2433, created: curTime };
      var paymentD = { status: 'overpaid', tx_id: 4, amount_paid: 5.123456789, created: (curTime + 10000) };

      var payments = [ paymentA, paymentB, paymentC, paymentD ];
      var resultArray = invoiceHelper.getPaymentHistory(payments);
      assert.equal(paymentA, resultArray[0]);
      assert.equal(paymentB, resultArray[1]);
      assert.equal(paymentD, resultArray[2]);
    });
  });
});