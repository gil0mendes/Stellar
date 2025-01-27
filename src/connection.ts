import { API } from "./common/types/api.types.ts";
import { ConnectionDetails } from "./common/types/connection-details.ts";

/**
 * This class represents an active connection.
 */
export class Connection<C> implements ConnectionDetails<C> {
	/**
	 * Api reference.
	 */
	private api: API;

	/**
	 * Unique client identifier.
	 */
	public id!: string;

	/**
	 * Timestamp of the connection.
	 */
	public connectedAt!: number;

	/**
	 * Rooms which the client belongs.
	 *
	 * @type {Array}
	 */
	public rooms: Array<string> = [];

	/**
	 * Connection error.
	 */
	public error?;

	/**
	 * Connection parameters.
	 */
	public params: Record<string, unknown> = {};

	/**
	 * Connection fingerprint.
	 */
	public fingerprint!: string;

	/**
	 * Number of pending actions to be processed.
	 */
	public pendingActions = 0;

	/**
	 * Total of actions that were processed for this connection.
	 */
	public totalActions = 0;

	/**
	 * Number of messages sent by this connection.
	 */
	public messageCount = 0;

	/**
	 * Informs if this connection supports chat.
	 */
	public canChat = false;

	public type!: string;

	/**
	 * Connection remote port.
	 */
	public remotePort!: number;

	/**
	 * Remote IP address.
	 */
	public remoteHostname!: string;

	/**
	 * Raw connection.
	 */
	public rawConnection!: C;

	/**
	 * For the cases where there is a local extension to the request.
	 */
	extension?: string;

	/**
	 * Is used to mark the connection as destroyed.
	 */
	public destroyed = false;

	/**
	 * Create a new connection object.
	 *
	 * The data object needs to have the follow properties:
	 *  - type
	 *  - remotePort
	 *  - remoteIP
	 *  - rawConnection
	 *
	 * @param api Stellar API reference
	 * @param data hash map
	 */
	constructor(api: API, data: ConnectionDetails<C>) {
		this.api = api;
		this.#setup(data);

		// Save this connection on the connection manager
		this.api.connections.connections[this.id] = this;

		// execute the middleware
		this.api.connections.globalMiddleware.forEach((middlewareName) => {
			if (typeof this.api.connections.middleware[middlewareName].create === "function") {
				this.api.connections.middleware[middlewareName].create(this);
			}
		});
	}

	/**
	 * Initialize the connection object.
	 *
	 * @param data
	 */
	#setup(data: ConnectionDetails<C>) {
		if (data.id) {
			this.id = data.id;
		} else {
			// generate an unique ID for this connection
			this.id = crypto.randomUUID();
		}

		this.connectedAt = new Date().getTime();

		const requiredFields = ["type", "rawConnection"];
		requiredFields.forEach((req) => {
			if (data[req] === null || data[req] === undefined) {
				throw new Error(`${req} is required to create a new connection object`);
			}

			this[req] = data[req];
		});

		const enforcedConnectionProperties = ["remotePort", "remoteHostname"];
		enforcedConnectionProperties.forEach((req) => {
			if (data[req] === null || data[req] === undefined) {
				if (this.api.config.general.enforceConnectionProperties === true) {
					throw new Error(`${req} is required to create a new connection object`);
				} else {
					data[req] = 0; // TODO: could be a random uuid as well?
				}
			}
			this[req] = data[req];
		});

		this.api.i18n.invokeConnectionLocale(this);
	}

	/**
	 * Send a message to this connection.
	 *
	 * @param message Message to be sent to the connection.
	 */
	public sendMessage(message: string) {
		throw new Error(`I should be replaced with a connection-specific method [${message}]`);
	}

	/**
	 * Send a file to this connection.
	 *
	 * @param path Path to the file that must be sent.
	 */
	public sendFile(path: string) {
		throw new Error(`I should be replaced with a connection-specific method [${path}]`);
	}

	/**
	 * Localize a message.
	 *
	 * @param message   Message to be localized.
	 */
	public localize(message: string) {
		return this.api.i18n.localize(message, this);
	}

	public destroy() {
		this.destroyed = true;

		// execute the destroy middleware
		this.api.connections.globalMiddleware.forEach((middlewareName) => {
			if (typeof this.api.connections.middleware[middlewareName].destroy === "function") {
				this.api.connections.middleware[middlewareName].destroy(this);
			}
		});

		// remove the connection from all rooms
		if (this.canChat === true) {
			this.rooms.forEach((room) => this.api.chatRoom.leave(this.id, room));
		}

		// get server instance
		const server = this.api.servers.servers[this.type];
		if (server) {
			if (server.attributes.logExits === true) {
				server.log("connection closed", "info", {
					to: this.remoteHostname,
				});
			}

			if (typeof server.goodbye === "function") {
				server.goodbye(this);
			}
		}

		// remove this connection from the connections array
		delete this.api.connections.connections[this.id];
	}

	/**
	 * Set a new connection attribute.
	 *
	 * @param key
	 * @param value
	 *
	 * @return Connection The current instance.
	 */
	public set(key: string, value: unknown) {
		this[key] = value;
		return this;
	}

	/**
	 * Execute the right operation for the given verb.
	 *
	 * @param verb      Verb to be executed.
	 * @param words     Words are optional.
	 */
	public async verbs(verb: string, words: string | Array<string> = []): Promise<unknown> {
		const server = this.api.servers.servers.get(this.type);

		let key;
		let value;
		let room;
		const allowedVerbs = server.attributes.verbs;

		if (!Array.isArray(words)) {
			words = [words];
		}

		if (server && allowedVerbs.indexOf(verb) >= 0) {
			server.log("verb", "debug", {
				verb,
				to: this.remoteHostname,
				params: JSON.stringify(words),
			});

			if (verb === "quit" || verb === "exit") {
				server.goodbye(this);
			} else if (verb === "paramAdd") {
				key = words[0];
				value = words[1];

				if (words[0] && words[0].indexOf("=") >= 0) {
					const parts = words[0].split("=");
					key = parts[0];
					value = parts[1];
				}

				this.params[key] = value;
				return null;
			} else if (verb === "paramDelete") {
				key = words[0];
				delete this.params[key];

				return null;
			} else if (verb === "paramView") {
				key = words[0];

				return this.params[key];
			} else if (verb === "paramsView") {
				return this.params;
			} else if (verb === "paramsDelete") {
				this.params = {};

				return null;
			} else if (verb === "roomJoin") {
				room = words[0];
				return this.api.chatRoom.join(this.id, room);
			} else if (verb === "roomLeave") {
				room = words[0];
				return this.api.chatRoom.leave(this.id, room);
			} else if (verb === "roomView") {
				// get requested room name
				room = words[0];

				if (this.rooms.indexOf(room) > -1) {
					return this.api.chatRoom.status(room);
				} else {
					throw new Error(`Not member of room "${room}"`);
				}
			} else if (verb === "detailsView") {
				return {
					id: this.id,
					fingerprint: this.fingerprint,
					remoteIP: this.remoteHostname,
					remotePort: this.remotePort,
					params: this.params,
					connectedAt: this.connectedAt,
					rooms: this.rooms,
					totalActions: this.totalActions,
					pendingActions: this.pendingActions,
				};
			} else if (verb === "say") {
				// get the room name
				room = words.shift();

				// broadcast the message on the requested room
				return this.api.chatRoom.broadcast(this, room, words.join(" "));
			} else if (verb === "event") {
				// get the vent information
				const { room, event, data } = words.shift();

				// execute the event on the event system
				this.api.events.fire(`event.${event}`, { room, data });
				this.api.events.fire(`event.${room}.${event}`, { room, data });

				// broadcast the event to the room
				return this.api.chatRoom.broadcast(this, room, { event, data });
			} else {
				throw new Error(this.api.config.errors.verbNotFound(this, verb));
			}
		} else {
			throw new Error(this.api.config.errors.verbNotAllowed(this, verb));
		}
	}
}
