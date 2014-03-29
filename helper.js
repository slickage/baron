module.exports = {
  decimalPlaces: function(number) {
    if(Math.floor(number) === number) {
      return 0;
    }
    return number.toString().split('.')[1].length || 0;
  },
  isNumber: function(number) {
      return !isNaN(parseFloat(number)) && isFinite(number);
  },
  toFourDecimals: function(number) {
    number = Number(number).toFixed(8).toString();
    var numberArr = number.toString().split('.');
    return numberArr[0] + '.' + numberArr[1].substring(0, 4);
  },
  getLastFourDecimals: function(number) {
    number = Number(number).toFixed(8).toString();
    return number.split('.')[1].substring(4, 8);
  },
  roundToDecimal: function(number, decimalPlaces) {
    var offset = Math.pow(10, decimalPlaces);
    return (Math.round(number * offset) / offset).toFixed(decimalPlaces);
  }
};
