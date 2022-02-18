const { MongoClient, ObjectID } = require('mongodb');	// require the mongodb driver

/**
 * Uses mongodb v3.6+ - [API Documentation](http://mongodb.github.io/node-mongodb-native/3.6/api/)
 * Database wraps a mongoDB connection to provide a higher-level abstraction layer
 * for manipulating the objects in our cpen322 app.
 */
function Database(mongoUrl, dbName){
	if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
	this.connected = new Promise((resolve, reject) => {
		MongoClient.connect(
			mongoUrl,
			{
				useNewUrlParser: true
			},
			(err, client) => {
				if (err) reject(err);
				else {
					console.log('[MongoClient] Connected to ' + mongoUrl + '/' + dbName);
					resolve(client.db(dbName));
				}
			}
		)
	});
	this.status = () => this.connected.then(
		db => ({ error: null, url: mongoUrl, db: dbName }),
		err => ({ error: err })
	);
}

Database.prototype.getRooms = function(){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			db.collection("chatrooms").find({}).toArray(function(err, result) {
				if (err) reject(err);
				else resolve(result);
			});
		})
	)
}

Database.prototype.getRoom = function(room_id){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			if (ObjectID.isValid(room_id)) room_id = ObjectID(room_id);
			db.collection("chatrooms").findOne({"_id": room_id}, function(err, result) {
				if (err) reject(err);
				else resolve(result);
			});
		})
	)
}

Database.prototype.addRoom = function(room){
	return this.connected.then(db => 
		new Promise((resolve, reject) => {
			if (room.name == null) {
				reject(new Error("Room name not provided"));
			} else {
				db.collection("chatrooms").insertOne(room, function(err, result) {
					if (err) reject(err);
					else resolve(room);
				});
			}
		})
	)
}

Database.prototype.getLastConversation = function(room_id, before = Date.now()){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			db.collection("conversations").find({"room_id": room_id}).toArray(function(err, result) {
				if (err) reject(err);
				else {
					var lastConversation = null;
					result.forEach(conversation => {
						if (conversation.timestamp < before)
							if (lastConversation == null || conversation.timestamp > lastConversation.timestamp) 
								lastConversation = conversation;
					});
					resolve(lastConversation);
				}
			});
		})
	)
}

Database.prototype.addConversation = function(conversation){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			if (conversation.room_id == null || conversation.timestamp == null || conversation.messages == null) {
				reject(new Error("Conversation object contains missing fields"));
			} else {
				db.collection("conversations").insertOne(conversation, function(err, result) {
					if (err) reject(err);
					resolve(conversation);
				});
			}
		})
	)
}

Database.prototype.getUser = function(username){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			db.collection("users").findOne({"username": username}, function(err, result) {
				if (err) reject(err);
				else resolve(result);
			});
		})
	)
}

module.exports = Database;
