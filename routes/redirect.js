/* jshint node: true */
'use strict';

var config = require(__dirname + '/../config');

var redirect = function(app) {
  app.get('/redirect/address/:address', function(req, res) {
    res.redirect(307, config.chainExplorerUrl + '/' + req.params.address);
  });
};

module.exports = redirect;
