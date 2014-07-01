var ddoc = {
  _id: '_design/ticker_usd',
  views: {},
  lists: {},
  shows: {}
};

ddoc.views.tickerByTime = {
  map: function(doc) {
    if (doc.type === 'ticker') {
      emit(doc.timestamp, doc);
    }
  }
};

module.exports = ddoc;
