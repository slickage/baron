module.exports = {
  decimalPlaces: function(number) {
    if(Math.floor(number) === number) return 0;
    return number.toString().split(".")[1].length || 0; 
 	},
 	isNumber: function(number) {
 		    return !isNaN(parseFloat(number)) && isFinite(number); 
 	}
};