var request = require('request');

module.exports = {
  decimalPlaces: function(number) {
    if(Math.floor(number) === number) return 0;
    return number.toString().split(".")[1].length || 0; 
 	},
 	isNumber: function(number) {
 		    return !isNaN(parseFloat(number)) && isFinite(number); 
 	},
  toFourDecimals: function(number) {
    number = number.toFixed(8).toString();
  	var numberArr = number.toString().split('.');
    return numberArr[0] + '.' + numberArr[1].substring(0, 4);
  },
  getLastFourDecimals: function(number) {
    number = number.toFixed(8).toString();
    return number.split('.')[1].substring(4, 8);
  }, 
  roundToEightDecimals: function(number) {
    return Math.round(number * 100000000) / 100000000;
  },
  convertToBtc: function(callback) {
  		request('https://www.bitstamp.net/api/ticker/', callback);
  }
};
