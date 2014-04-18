var crypto = require('crypto');
var input = process.argv[2];
var hash = crypto.createHash('md5').update(input).digest('hex');
console.log(hash);