var MongoClient = require('mongodb').MongoClient
  , format = require('util').format
  , ObjectID = require('mongodb').ObjectID;

MongoClient.connect('mongodb://127.0.0.1:27017/basicpay', function(err, db) {
  if(err) throw err;

  var collection = db.collection('invoices');
  //Locate all the entries using find
  collection.find().toArray(function(err, results) {
    results.forEach(function(entry) {
      console.log(entry.lineItems[0]);
    });
    // Let's close the db
    db.close();
  });
 // ok
});
