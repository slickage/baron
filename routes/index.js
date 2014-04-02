module.exports = function(app) {
  require('./invoices')(app);
  require('./pay')(app);
  require('./paymentqr')(app);
  require('./notify')(app);
};