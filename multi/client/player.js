/**
 * @module client/player
 * @private
 */
 
define(function(require, exports, module) {

	var EventDispatcher = require('../shared/eventDispatcher');
	var WatchJS = require('../debs/watch');
	var util = require('../shared/util');

	/**
	* @classdesc This player class represents a device connected
	* to a session. Every player is mirrored from its original instance 
	* on the server side.
	* 
	* @inner
	* @class
	* @protected
	* @mixes EventDispatcher
	* @memberof module:client/player
	* @fires module:client/player~Player#attributesChanged
	* @fires module:client/player~Player#disconnected
	*
	* @param socket ready to use socket.io socket
	*/
	var Player = function (socket) {

		EventDispatcher.call(this);

		/** 
		 * communication socket for this player
		 * @type {socket.io-socket}
		 * @private
		 */
		this.socket = socket;
		/** 
		 * unique id for this player
		 * @type {string}
		 * @readonly
		 */
		this.id = null;
		/**
		 * Role that is fulfilled by this
		 * player. Either 'presenter' or 'player'.
		 * @type {string}
		 * @readonly
		 */
		this.role = 'player';
		/** 
		 * Object with user attributes for this player.
		 * All changes within this object will automatically
		 * be synced to the server side and all other clients. 
		 * Make sure not to override the hole object but only 
		 * its attributes.
		 * <br>
		 * Listen for changes by subscribing to the
		 * {@link module:client/player~Player#attributesChanged attributesChanged}
		 * event.
		 * @type {object}
		 */
		this.attributes = {};
		/**
		 * Unique player-number inside this session beginning with 0.
		 * Free numbers from disconnected players will be reused to
		 * avoid gaps.
		 * @type {integer}
		 * @readonly
		 */
		// TODO: last connected player has no number 
		this.number = null;

		// listeners
		this.onPlayerMessage = this.onPlayerMessage.bind(this);
		this.onPlayerAttributesChanged = this.onPlayerAttributesChanged.bind(this);
		this.onPlayerLeft = this.onPlayerLeft.bind(this);
		this.onAttributesChange = this.onAttributesChange.bind(this);

		this.socket.on('playerMessage', this.onPlayerMessage);
		this.socket.on('playerAttributesChanged', this.onPlayerAttributesChanged);
		this.socket.on('playerLeft', this.onPlayerLeft);
		WatchJS.watch(this.attributes, this.onAttributesChange, 0, true);
	};

	util.inherits(Player, EventDispatcher);

	/**
	 * Called when any player left its session.
	 * @private
	 */
	Player.prototype.onPlayerLeft = function (data) {
		if (data.playerId === this.id) {
			// I do not longer exist - inform...
			this.dispatchEvent('disconnected');
			// ... and remove listeners
			this.removeAllListeners();
			this.socket.removeListener('playerMessage', this.onPlayerMessage);
			this.socket.removeListener('playerAttributesChanged', this.onPlayerAttributesChanged);
			this.socket.removeListener('playerLeft', this.onPlayerLeft);
			WatchJS.unwatch(this.attributes, this.onAttributesChange);
		}
	};

	/**
	 * Called when this socket receives a message for any player.
	 * @private
	 */
	Player.prototype.onPlayerMessage = function (data) {
		if (data.id === this.id) {
			this.dispatchEvent(data.type, { type: data.type, data: data.data } );
		}
	};

	/**
	 * Called when attributes for any player have been changed
	 * on server side.
	 * @private
	 */
	Player.prototype.onPlayerAttributesChanged = function (data) {
		if (data.id === this.id) {
			WatchJS.unwatch(this.attributes, this.onAttributesChange);
			for (var i in data.attributes) {
				if (!this.attributes.hasOwnProperty(i) ||
						JSON.stringify(this.attributes[i]) !== JSON.stringify(data.attributes[i])) {
					this.attributes[i] = data.attributes[i];
					this.dispatchEvent('attributesChanged',
						{ key: i, value: data.attributes[i]});
				}
			}
			WatchJS.watch(this.attributes, this.onAttributesChange, 0, true);
		}
	};

	/** 
	 * Called when the user attributes have been changed.
	 * @param {string} prop      property that has been changed
	 * @param {string} action    what has been done to the property
	 * @param          newvalue  new value of the changed property
	 * @param          oldvalue  old value of the changed property
	 * @private
	 */
	Player.prototype.onAttributesChange = function (prop, action, newvalue, oldvalue) {
		//console.log(prop+" - action: "+action+" - new: "+newvalue+", old: "+oldvalue);
		this.socket.emit('playerAttributesClientChanged',
			{ id: this.id, attributes: this.attributes }
		);
	};

	/**
	* Sends the given message to all other instances of this player.
	* @example
	* // on client no 1
	* player.on('ping', function (event) {
	*   // outputs 'bar'
	*   console.log(event.data.foo);
	* });
	* // on client no 2, instance of same player
	* player.message('ping', { foo: 'bar' });
	* @param {string} type    type of message that should be send
	* @param {object} [data]  message data that should be send
	*/
	Player.prototype.message = function (type, data) {
		this.socket.emit('playerMessage',
			{ id: this.id, type: type, data: data }
		);
	};


	/**
	 * Fired when the {@link module:client/player~Player#attributes attributes} of 
	 * this player have been changed by this client, another client or 
	 * the server.
	 * @event module:client/player~Player#attributesChanged
	 * @property {string} key    name of the changed attribute
	 * @property {*}      value  new value of the changed attribute
	 * @todo this is currently dispatched only when changed from outside
	 */

	/**
	 * Fired when this player disconnects from the server. Don't use this
	 * instance any longer after this event has been fired.
	 * @event module:client/player~Player#disconnected
	 */


	/**
	* Unpacks a player object send over a socket connection.
	* @returns {module:client/player~Player}
	*/
	exports.fromPackedData = function (data, socket) {
		var player = new Player(socket);
		for (var i in data) {
			if (i === 'attributes') {
				for (var j in data[i]) {
					player.attributes[j] = data[i][j];
				}
			} else {
				player[i] = data[i];
			}
		}
		return player;
	};

	return exports;

});