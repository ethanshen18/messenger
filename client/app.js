function emptyDOM(elem) {
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

function createDOM(htmlString) {
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

function createRoom(roomId, roomName) {
	return createDOM(`
		<li class = "room">
			<a href = "#/chat/${roomId}">
				<img src = "assets/everyone-icon.png" class = 'room-icons'/>
				${roomName}
			</a>
		</li>
	`);
}

function escapeHtml(str) {
	return str
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function createMessage(message) {
	return createDOM(`
		<div class = "message${(message.username == profile.username) ? ' my-message' : ''}">
			<span class = "message-user">${message.username}</span>
			<span class = "message-text">${escapeHtml(message.text)}</span>
		</div>
	`);
}

//////////////////////////////////////////////////////////////////////////////////////////////

const Service = {
	origin: window.location.origin,
	getAllRooms: function() {
		return (async () => {
			const response = await fetch(Service.origin + '/chat');
			if (response.ok) return Promise.resolve(await response.json());
			else return Promise.reject(new Error(await response.text()));
		})();
	},
	addRoom: function(data) {
		return (async () => {
			const response = await fetch(Service.origin + '/chat', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(data),
			});
			if (response.ok) return Promise.resolve(await response.json());
			else return Promise.reject(new Error(await response.text()));
		})();
	},
	getLastConversation: function(roomId, before) {
		return (async () => {
			let param = new URLSearchParams();
			param.set('before', before)
			const response = await fetch(Service.origin + '/chat/' + roomId + '/messages?' + param.toString());
			if (response.ok) return Promise.resolve(await response.json());
			else return Promise.reject(new Error(await response.text()));
		})();
	},
	getProfile: function() {
		return (async () => {
			const response = await fetch(Service.origin + '/profile');
			if (response.ok) return Promise.resolve(await response.json());
			else return Promise.reject(new Error(await response.text()));
		})();
	}
};

//////////////////////////////////////////////////////////////////////////////////////////////

function* makeConversationLoader(room) {
	var lastTimeStamp = room.timestamp;
	var temp = null;
	while (room.canLoadConversation) {
		room.canLoadConversation = false;
		Service.getLastConversation(room.id, lastTimeStamp).then(function(conversation) {
			if (conversation) {
				room.canLoadConversation = true;
				lastTimeStamp = conversation.timestamp;
				room.addConversation(conversation);
			}
			temp = conversation;
			console.log('getLastConversation success');
		}).catch(function(error) {
			console.log('getLastConversation failed: ' + error);
		});
		yield Promise.resolve(temp);
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////

var profile = {username: ''}
window.addEventListener('load', main);

class Room {
	constructor(id, name, image = 'assets/everyone-icon.png', messages = []) {
		this.id = id;
		this.name = name;
		this.image = image;
		this.messages = messages;
		this.timestamp = Date.now();
		this.canLoadConversation = true;
		this.getLastConversation = makeConversationLoader(this);
	}

	addMessage(username, text) { 
		if (!text.trim().length) return;
		const newMessage = {username: username, text: text}
		this.messages.push(newMessage);
		if (this.onNewMessage) this.onNewMessage(newMessage); 
	}

	addConversation(conversation) {
		conversation.messages.slice().reverse().forEach(message => {this.messages.unshift(message)})
		if (this.onFetchConversation) this.onFetchConversation(conversation); 
	}
}

class Lobby {
	constructor() {
		this.rooms = new Object();
	}

	getRoom(roomId) {
		return this.rooms[roomId];
	}

	addRoom(id, name, image = 'assets/everyone-icon.png', messages = []) {
		const newRoom = new Room(id, name, image, messages)
		this.rooms[id] = newRoom;
		if (this.onNewRoom) this.onNewRoom(newRoom); 
	}
}

class LobbyView {
	constructor(lobby) {
		this.lobby = lobby;
		this.elem = createDOM(`
			<div class = "content">
				<ul class = "room-list"></ul>
				<div class = "page-control">
					<input type = "text" class = "page-control-input" placeholder="Room Title">
					<button class = "page-control-button">Create Room</button>
				</div>
			</div>
		`);
		this.listElem = this.elem.querySelector('ul.room-list');
		this.inputElem = this.elem.querySelector('input');
		this.buttonElem = this.elem.querySelector('button');
		this.buttonElem.addEventListener('click', () => this.buttonClick(), false);
		this.redrawList();
		this.lobby.onNewRoom = room => (this.listElem.appendChild(createRoom(room.id, room.name)));
	}

	redrawList() {
		emptyDOM(this.listElem);
		for (const roomId in this.lobby.rooms) this.listElem.appendChild(createRoom(roomId, this.lobby.rooms[roomId].name));
	}

	buttonClick() {
		const lobby = this.lobby
		const input = {name: this.inputElem.value, image: 'assets/everyone-icon.png'};
		Service.addRoom(input).then(function(newRoom) {
			lobby.addRoom(newRoom._id, newRoom.name, newRoom.image, newRoom.messages);
			console.log('addRoom success');
		}).catch(function(error) {
			console.log('addRoom failed: ' + error);
		});
		this.inputElem.value = '';
	}
}

class ChatView {
	constructor(socket) {
		this.elem = createDOM(`
			<div class = "content">
				<h4 class = "room-name"></h4>
				<div class = "message-list"></div>
				<div class = "page-control">
					<textarea class = "page-control-input" placeholder="Aa"></textarea>
					<button class = "page-control-button">Send</button>
				</div>
			</div>
		`);
		this.socket = socket;
		this.room = null;
		this.titleElem = this.elem.querySelector('h4');
		this.chatElem = this.elem.querySelector('div.message-list');
		this.inputElem = this.elem.querySelector('textarea');
		this.buttonElem = this.elem.querySelector('button');
		this.buttonElem.addEventListener("click", () => this.sendMessage(), false);
		this.inputElem.addEventListener('keyup', (e) => {if (e.keyCode == 13 && !e.shiftKey) this.sendMessage();}, false);
		this.chatElem.addEventListener('wheel', (e) => {
			if (this.room.canLoadConversation == true && e.deltaY < 0 && this.chatElem.scrollTop <= 0) {
				this.room.getLastConversation.next();
			}
		}, false);
	}

	setRoom(room) {
		this.room = room;
		this.titleElem.innerHTML = this.room.name;
		this.inputElem.value = '';
		emptyDOM(this.chatElem);
		for (const message of this.room.messages) this.chatElem.appendChild(createMessage(message));
		this.room.onNewMessage = message => (this.chatElem.appendChild(createMessage(message)));
		this.room.onFetchConversation = conversation => {
			var before = this.chatElem.scrollHeight;
			conversation.messages.slice().reverse().forEach(message => {
				this.chatElem.prepend(createMessage(message))
			});
			var after = this.chatElem.scrollHeight;
			this.chatElem.scrollTop = after - before;
		};
	}

	sendMessage() {
		this.room.addMessage(profile.username, this.inputElem.value);
		this.socket.send(JSON.stringify({roomId: this.room.id, text: this.inputElem.value}));
		this.inputElem.value = '';
	}
}

class ProfileView {
	constructor() {
		this.elem = createDOM(`
			<div class = "content">
				<div class = "profile-form">
					<div class = "form-field">
						<label class = "form-label">Username</label>
						<input type = "text" class = "form-input">
					</div>
					<div class = "form-field">
						<label class = "form-label">Password</label>
						<input type = "password" class = "form-input">
					</div>
					<div class = "form-field">
						<label class = "form-label">Avatar Image</label>
						<input type="file">
					</div>
				</div>
				<div class = "page-control">
					<button class = "page-control-button">Save</button>
				</div>
			</div>
		`);
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////

function main() {
	function renderRoute() {
		var url = window.location.hash;
		var pageView = document.getElementById('page-view');
		if (url == '#/' || url == '' ) {
			emptyDOM(pageView);
			pageView.appendChild(lobbyView.elem);
		}
		if (url.includes('chat')) {
			chatView.setRoom(lobby.getRoom(url.split('/').pop()));
			emptyDOM(pageView);
			pageView.appendChild(chatView.elem);
		}
		if (url.includes('profile')) {
			emptyDOM(pageView);
			pageView.appendChild(profileView.elem);
		}
	}

	function refreshLobby() {
		Service.getAllRooms().then(function(newRooms) {
			newRooms.forEach(newRoom => {
				if (newRoom._id in lobby.rooms) {
					lobby.rooms[newRoom._id].name = newRoom.name;
					lobby.rooms[newRoom._id].image = newRoom.image;
				} else {
					lobby.addRoom(newRoom._id, newRoom.name, newRoom.image, newRoom.messages);
				}
			});
			console.log('refreshLobby success');
		}).catch(function(error) {
			console.log('refreshLobby failed: ' + error);
		});
	}

	const socket = new WebSocket('ws://localhost:8000');
	socket.addEventListener('message', function (event) {
		const newMessage = JSON.parse(event.data);
		lobby.getRoom(newMessage.roomId).addMessage(newMessage.username, newMessage.text);
	});

	Service.getProfile().then(function(response) {
		profile.username = response.username;
		console.log('getProfile success');
	}).catch(function(error) {
		console.log('getProfile failed: ' + error);
	});

	const lobby = new Lobby();
	const lobbyView = new LobbyView(lobby);
	const chatView = new ChatView(socket);
	const profileView = new ProfileView();

	setInterval(refreshLobby, 30000);
	refreshLobby();
	window.addEventListener('popstate', renderRoute);
	renderRoute();

	cpen322.export(arguments.callee, {lobby, chatView});
}
