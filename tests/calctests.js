var assert = require('assert');
var invoiceHelper = require(__dirname + '/../invoicehelper');

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