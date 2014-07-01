var ddoc = {
  _id: '_design/ticker_usd',
  views: {},
  lists: {},
  shows: {}
};

module.exports = ddoc;

ddoc.views.tickerByTime = {
  map: function(doc) {
    if (doc.type === 'ticker')
      emit(doc.timestamp, doc);
  }
};
