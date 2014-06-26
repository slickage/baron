/* jshint node: true */
'use strict';

var crypto = require('crypto');
var input = process.argv[2];
var hash = crypto.createHash('sha256').update(input).digest('hex');
console.log(hash);