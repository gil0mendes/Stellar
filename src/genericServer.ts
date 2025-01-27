import { EventEmitter } from "node:events";
import { Connection, ConnectionDetails } from "./connection.ts";
import { API } from "./common/types/api.types.ts";
import { GetFileResponse } from "./common/types/static-file.interface.ts";

/**
 * This function is called when the method is not implemented.
 */
const methodNotDefined = () => {
	throw new Error("The containing method should be defined for this server type");
};

type BuildConnectionParams<C> = {
	/**
	 * Unique connection identifier.
	 */
	id: string;

	/**
	 * Client fingerprint.
	 */
	fingerprint: string;

	/**
	 * Remote hostname.
	 */
	remoteHostname: string;

	/**
	 * Remote port.
	 */
	remotePort: number;

	/**
	 * Generic connection object.
	 */
	rawConnection: C;
};

/**
 * This is the prototypical generic server class that all other types
 * of servers inherit from.
 */
export default class GenericServer<C> extends EventEmitter {
	/**
	 * API object reference.
	 */
	protected api: API;

	/**
	 * Connection type.
	 */
	type;

	/**
	 * Connection options.
	 */
	options;

	/**
	 * Connection attributes.
	 */
	attributes;

	/**
	 * Constructor.
	 *
	 * @param api
	 * @param name
	 * @param options
	 * @param attributes
	 */
	constructor(api, name, options, attributes) {
		// call super class constructor
		super();

		this.api = api;
		this.type = name;
		this.options = options;
		this.attributes = attributes;

		// attributes can be overwritten by the options
		for (const key in this.options) {
			if (this.attributes[key] !== null && this.attributes[key] !== undefined) {
				this.attributes[key] = this.options[key];
			}
		}
	}

	/**
	 * Build a new connection object.
	 *
	 * @param params Connection data.
	 */
	buildConnection(params: BuildConnectionParams<C>): Connection<C> {
		const details: ConnectionDetails<C> = {
			type: this.type,
			id: params.id,
			remotePort: params.remotePort,
			remoteHostname: params.remoteHostname,
			rawConnection: params.rawConnection,
			canChat: this.attributes.canChat,
			fingerprint: params.fingerprint,
		};

		// get connection class
		const ConnectionClass = this.api.connection as typeof Connection;

		// create a new connection instance
		const connection = new ConnectionClass<C>(this.api, details);

		// define sendMessage method
		connection.sendMessage = (message) => {
			this.sendMessage(connection, message);
		};

		// define sendFile method
		connection.sendFile = (path) => {
			connection.params.file = path;
			this.processFile(connection);
		};

		// emit the new connection object
		this.emit("connection", connection);

		// check if the lod for this type of connection is active
		if (this.attributes.logConnections === true) {
			this.log("new connection", "info", { to: connection.remoteHostname });
		}

		// bidirectional connection can have a welcome message
		if (this.attributes.sendWelcomeMessage === true) {
			connection.sendMessage({
				welcome: this.api.config.general.welcomeMessage,
				context: "api",
			});
		}

		if (typeof this.attributes.sendWelcomeMessage === "number") {
			setTimeout(() => {
				try {
					connection.sendMessage({
						welcome: this.api.config.general.welcomeMessage,
						context: "api",
					});
				} catch (e) {
					this.api.log.error(e);
				}
			}, this.attributes.sendWelcomeMessage);
		}

		return connection;
	}

	/**
	 * Process an action request.
	 *
	 * @param connection Connection object.
	 */
	async processAction(connection: Connection<C>) {
		const ActionProcessor = this.api.actionProcessor;
		const actionProcessor = new ActionProcessor(this.api, connection);

		const data = await actionProcessor.processAction();
		this.emit("actionComplete", data);
	}

	/**
	 * Process a file request.
	 *
	 * @param connection Connection object.
	 */
	async processFile(connection: Connection<C>) {
		const response = await this.api.staticFile.get<C>(connection);
		this.sendFile(response);
	}

	/**
	 * Send a file to the client.
	 *
	 * @param _fileResponse Response with the
	 */
	sendFile(_fileResponse: GetFileResponse<C>) {
		throw new Error("Not supported");
	}

	/**
	 * Get all active connection of this server.
	 *
	 * This don't work in some type of servers.
	 *
	 * @returns {Array}
	 */
	connections() {
		const _connections = [];

		for (const i in this.api.connections.connections) {
			const connection = this.api.connections.connections[i];
			if (connection.type === this.type) {
				_connections.push(connection);
			}
		}

		return _connections;
	}

	/**
	 * Log function.
	 *
	 * @param message   Message to be logged.
	 * @param severity  Severity level.
	 * @param data      Additional data to be printed out.
	 */
	log(message, severity, data) {
		this.api.log(`[Server: ${this.type}] ${message}`, severity, data);
	}

	/**
	 * Invoked as part of boot.
	 */
	start() {
		methodNotDefined();
	}

	/**
	 * Invoked as part of shutdown.
	 */
	stop() {
		methodNotDefined();
	}

	/**
	 * This method will be appended to the connection as 'connection.sendMessage'
	 *
	 * @param connection  Connection object.
	 * @param message     Message be sent back to the client.
	 * @param messageCount Number of the message already sent for this client.
	 */
	sendMessage(connection, message, messageCount) {
		methodNotDefined();
	}

	/**
	 * This method will be used to gracefully disconnect the client.
	 *
	 * @param connection  Connection object.
	 * @param reason      Reason for disconnection.
	 */
	goodbye(connection, reason) {
		methodNotDefined();
	}
}
