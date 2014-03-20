var MongoClient = require('mongodb').MongoClient
  , format = require('util').format
  , ObjectID = require('mongodb').ObjectID;

MongoClient.connect('mongodb://127.0.0.1:27017/basicpay', function(err, db) {
  if(err) throw err;

  var collection = db.collection('invoices');
  // Locate all the entries using find
  // collection.find().toArray(function(err, results) {
  //   console.dir(results);
  //   // Let's close the db
  //   db.close();
  // });
  collection.findOne({_id: new ObjectID('532b79de0ca9cd0e3e75cd3b')}, function(err, item) {
    console.log(item);
    db.close();
  })  // ok
})
