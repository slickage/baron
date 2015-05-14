'use strict';

var config = require(__dirname + '/../config');

var redirect = function(app) {
  app.get('/redirect/txid/:txid', function(req, res) {
    res.redirect(307, config.chainExplorerUrl + '/' + req.params.txid);
  });
};

module.exports = redirect;
