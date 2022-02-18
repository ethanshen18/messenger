const crypto = require('crypto');

class SessionError extends Error {};

function SessionManager (){
	// default session length - you might want to
	// set this to something small during development
	const CookieMaxAgeMs = 600000;

	// keeping the session data inside a closure to keep them protected
	const sessions = {};

	// might be worth thinking about why we create these functions
	// as anonymous functions (per each instance) and not as prototype methods
	this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
		const newToken = crypto.randomBytes(16).toString('hex');
		const newSession = {
			username: username, 
			timestamp: Date.now(),
			expiry: Date.now() + maxAge
		};
		sessions[newToken] = newSession;
		response.cookie('cpen322-session', newToken, {maxAge: maxAge});
		setTimeout(() => delete sessions[newToken], maxAge);
	};

	this.deleteSession = (request) => {
		delete sessions[request.session];
		delete request.username;
		delete request.session;
	};

	this.middleware = (request, response, next) => {
		if (this.validateCookie(request)) next();
		else next(new SessionError);
	};

	this.validateCookie = (request) => {
		var temp = request.headers.cookie;
		if (!temp || !temp.includes('cpen322-session')) return false;
		temp = temp.substr(temp.indexOf('cpen322-session'));
		temp = temp.substr(temp.indexOf('=') + 1);
		if (temp.includes(';')) temp = temp.substr(0, temp.indexOf(';'));
		if (temp in sessions) {
			request.username = sessions[temp].username;
			request.session = temp;
		} else return false;
		return true;
	};

	// this function is used by the test script.
	// you can use it if you want.
	this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);
};

// SessionError class is available to other modules as "SessionManager.Error"
SessionManager.Error = SessionError;

module.exports = SessionManager;
