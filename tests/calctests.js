var assert = require('assert');
var invoiceUtil = require(__dirname + '/../invoiceutil');

describe('invoiceutil', function() {
  describe('#getAmountDue', function() {
    it('should return amount due', function() {
      assert.equal('0', invoiceUtil.getAmountDue(1, 1, 'BTC').toString());
      assert.equal('0.25', invoiceUtil.getAmountDue(0.5, 0.25, 'BTC').toString());
      assert.equal('1.25', invoiceUtil.getAmountDue(1.50, 0.25, 'BTC').toString());
      assert.equal('10.5', invoiceUtil.getAmountDue(10.750000003, 0.25, 'BTC').toString());

      assert.equal('0.00', invoiceUtil.getAmountDue(1, 1, 'USD').toString());
      assert.equal('0.25', invoiceUtil.getAmountDue(0.5, 0.25, 'USD').toString());
      assert.equal('1.25', invoiceUtil.getAmountDue(1.50, 0.25, 'USD').toString());
      assert.equal('10.50', invoiceUtil.getAmountDue(10.750000003, 0.25, 'USD').toString());
    });
  });
});