module.exports = {
  decimalPlaces: function(number) {
    if(Math.floor(number) === number) return 0;
    return number.toString().split(".")[1].length || 0; 
 	},
 	isNumber: function(number) {
 		    return !isNaN(parseFloat(number)) && isFinite(number); 
 	},
  toFourDecimals: function(number) {
  	var numberArr = number.split('.');
    return numberArr[0] + '.' + numberArr[1].substring(0, 4);
  },
  getLastFourDecimals: function(number) {
    return number.split('.')[1].substring(4, 8);
  } 
};