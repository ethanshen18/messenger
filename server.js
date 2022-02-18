const cpen322 = require('./cpen322-tester.js');

//////////////////////////////////////////////////////////////////////////////////////////////

const crypto = require('crypto');
const SessionManager = require('./SessionManager.js');
const sessionManager = new SessionManager();

//////////////////////////////////////////////////////////////////////////////////////////////

const path = require('path');
const fs = require('fs');
const express = require('express');
const { response } = require('express');

function logRequest(req, res, next){
	console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
	next();
}

const host = 'localhost';
const port = 3000;
const clientApp = path.join(__dirname, 'client');

let app = express();

app.use(express.json()) 						// to parse application/json
app.use(express.urlencoded({ extended: true })) // to parse application/x-www-form-urlencoded
app.use(logRequest);							// logging for debug

app.listen(port, () => {
	console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});

//////////////////////////////////////////////////////////////////////////////////////////////

function escapeHtml(str) {
	return str
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

//////////////////////////////////////////////////////////////////////////////////////////////

const messageBlockSize = 10;
const messages = new Object();

const WebSocket = require('ws');
const broker = new WebSocket.Server({ port: 8000 });

broker.on('connection', function connection(socket, request) {
	if (!sessionManager.validateCookie(request)) socket.close();
	socket.on('message', function incoming(data, isBinary) {
		const newMessage = JSON.parse(data);
		newMessage.text = escapeHtml(newMessage.text);
		newMessage.username = request.username;
		data = JSON.stringify(newMessage);
		messages[newMessage.roomId].push({username: newMessage.username, text: newMessage.text});
		broker.clients.forEach(function each(client) {
			if (client !== socket && client.readyState === WebSocket.OPEN) {
				client.send(data, { binary: isBinary });
			}
		});

		if (messages[newMessage.roomId].length == messageBlockSize) {
			const newConversation = {
				room_id: newMessage.roomId,
				timestamp: Date.now(),
				messages: messages[newMessage.roomId]
			};
			db.addConversation(newConversation);
			messages[newMessage.roomId] = [];
		}
	});
});

const Database = require('./Database.js');
const db = new Database('mongodb://127.0.0.1:27017', 'cpen322-messenger');

//////////////////////////////////////////////////////////////////////////////////////////////

db.getRooms().then(function(allRooms) {
	allRooms.forEach(room => {
		messages[room._id] = [];
	});
}).catch(function(error) {
	console.log('db.getRooms failed: ' + error);
});

app.get('/chat', sessionManager.middleware, function (request, response) {
	db.getRooms().then(function(allRooms) {
		const rooms = [];
		allRooms.forEach(room => {
			rooms.push({_id: room._id, name: room.name, image: room.image, messages: messages[room._id]});
		});
		response.status(200).send(rooms);
	}).catch(function(error) {
		console.log('db.getRooms failed: ' + error);
	});
});

app.get('/chat/:room_id', sessionManager.middleware, function (request, response) {
	db.getRoom(request.params.room_id).then(function(room) {
		if (room == null) response.status(404).send("Room " + request.params.room_id + " was not found");
		else response.status(200).send(room);
	}).catch(function(error) {
		console.log('db.getRoom failed: ' + error);
	});
});

app.get('/chat/:room_id/messages', sessionManager.middleware, function (request, response) {
	db.getLastConversation(request.params.room_id, request.query.before).then(function(conversation) {
		if (conversation == null) response.status(404).send("Last conversation for room " + request.params.room_id + " was not found");
		else response.status(200).send(conversation);
	}).catch(function(error) {
		console.log('db.getLastConversation failed: ' + error);
	});
});

app.post('/chat', sessionManager.middleware, function (request, response) {
	const newRoom = {name: request.body['name'], image: request.body['image']};
	db.addRoom(newRoom).then(function(room) {
		messages[room._id] = [];
		response.status(200).send(room);
	}).catch(function(error) {
		response.status(400).send(error);
	});
});

//////////////////////////////////////////////////////////////////////////////////////////////

function isCorrectPassword(password, saltedHash) {
	return crypto.createHash('sha256').update(password + saltedHash.substr(0, 20)).digest('base64') == saltedHash.substr(20);
}

app.post('/login', function (request, response) {
	db.getUser(request.body.username).then(function(user) {
		if (user != null && isCorrectPassword(request.body.password, user.password)) {
			sessionManager.createSession(response, user.username);
			response.redirect('/');
		} else response.redirect('/login');
	}).catch(function(error) {
		response.redirect('/login');
	});
});

app.get('/logout', function (request, response) {
	sessionManager.deleteSession(response);
	response.redirect('/login');
});

//////////////////////////////////////////////////////////////////////////////////////////////

app.get('/profile', sessionManager.middleware, function (request, response) {
	if (request.username) response.status(200).send({username : request.username});
	else response.status(400).send(new Error('Username not found in request object'));
});

app.use('/app.js', 		sessionManager.middleware, 	express.static(clientApp + '/app.js'));
app.use('/index.html', 	sessionManager.middleware, 	express.static(clientApp + '/index.html'));
app.use('/index', 		sessionManager.middleware, 	express.static(clientApp + '/index.html'));

app.use('/login.html', 								express.static(clientApp + '/login.html'));
app.use('/login', 									express.static(clientApp + '/login.html'));
app.use('/style.css', 								express.static(clientApp + '/style.css'));
app.use('/assets', 									express.static(clientApp + '/assets'));
app.use('/', 			sessionManager.middleware, 	express.static(clientApp, { extensions: ['html'] }));

//////////////////////////////////////////////////////////////////////////////////////////////

app.use(function (err, request, response, next) {
	if (err instanceof SessionManager.Error) {
		if (request.headers.accept == 'application/json') response.status(401).send(err);
		else response.redirect('/login');
	} else response.status(500).send('Something broke!')
})

//////////////////////////////////////////////////////////////////////////////////////////////

cpen322.connect('http://99.79.42.146/cpen322/test-a5-server.js');
cpen322.export(__filename, {app, db, messages, messageBlockSize, sessionManager, isCorrectPassword});
