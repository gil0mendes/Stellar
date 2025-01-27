import fs from "node:fs";
import util from "node:util";
import path from "node:path";
import Primus from "primus";
import UglifyJS from "uglify-js";
import GenericServer from "../genericServer.ts";

// server type
const type = "websocket";

// server attributes
const attributes = {
	canChat: true,
	logConnections: true,
	logExists: true,
	sendWelcomeMessage: true,
	verbs: [
		"quit",
		"exit",
		"roomJoin",
		"roomLeave",
		"roomView",
		"detailsView",
		"say",
		"event",
	],
};

export default class WebSocketServer extends GenericServer {
	/**
	 * Server instance.
	 */
	server;

	/**
	 * Creates a new server instance.
	 *
	 * @param api stellar engine interface.
	 * @param options sever options.
	 */
	constructor(api, options) {
		super(api, type, options, attributes);

		// connection event
		this.on("connection", (connection) => {
			connection.rawConnection.on("data", (data) => {
				this._handleData(connection, data);
			});
		});

		// action complete event
		this.on("actionComplete", (data) => {
			if (data.toRender !== false) {
				data.connection.response.messageCount = data.messageCount;
				this.sendMessage(data.connection, data.response, data.messageCount);
			}
		});
	}

	// ------------------------------------------------------------------------------------------------ [REQUIRED METHODS]

	/**
	 * Start the server
	 */
	start() {
		const webserver = this.api.servers.servers.web;
		if (!webserver) {
			throw new Error("websocket server requires web server to be enabled");
		}

		// create a new primus instance
		this.server = new Primus(
			webserver.server,
			this.api.config.servers.websocket.server,
		);

		// define some event handlers
		this.server.on("connection", (rawConnection) => this._handleConnection(rawConnection));
		this.server.on("disconnection", (rawConnection) => this._handleDisconnection(rawConnection));

		this.api.log(
			`webSocket bound to ${webserver.options.bindIP}:${webserver.options.port}`,
			"debug",
		);
		this.server.active = true;

		// write client js
		this._writeClientJS();
	}

	/**
	 * Shutdown the websocket server.
	 */
	async stop() {
		// disable the server
		this.active = false;

		// destroy clients connections
		if (this.api.config.servers.websocket.destroyClientOnShutdown === true) {
			this.connections().forEach((connection) => {
				connection.destroy();
			});
		}
	}

	/**
	 * Send a message.
	 *
	 * @param connection      Connection where the message must be sent.
	 * @param message         Message to send.
	 * @param messageCount    Message number.
	 */
	sendMessage(connection, message, messageCount) {
		// serialize the error if exists
		if (message.error) {
			message.error = this.api.config.errors.serializers.servers.websocket(
				message.error,
			);
		}

		// if the message don't have a context set to 'response'
		if (!message.context) {
			message.context = "response";
		}

		// if the messageCount isn't defined, get it from the connection object
		if (!messageCount) {
			messageCount = connection.messageCount;
		}

		if (message.context === "response" && !message.messageCount) {
			message.messageCount = messageCount;
		}

		// write the message to socket
		connection.rawConnection.write(message);
	}

	/**
	 * Action to be executed on a file request.
	 *
	 * @param connection      Client connection object.
	 * @param error           Error, if exists.
	 * @param fileStream      FileStream.
	 * @param mime            Mime type.
	 * @param length          File size.
	 * @param lastModified    Last file modification timestamp.
	 */
	sendFile(connection, error, fileStream, mime, length, lastModified) {
		let content = "";
		let response = {
			error: error,
			content: null,
			mime: mime,
			length: length,
			lastModified: lastModified,
		};

		try {
			if (!error) {
				fileStream.on("data", (d) => {
					content += d;
				});
				fileStream.on("end", () => {
					response.content = content;
					this.server.sendMessage(
						connection,
						response,
						connection.messageCount,
					);
				});
			} else {
				this.server.sendMessage(connection, response, connection.messageCount);
			}
		} catch (e) {
			this.api.log(e, "warning");
			this.server.sendMessage(connection, response, connection.messageCount);
		}
	}

	/**
	 * Action to be executed on the goodbye.
	 *
	 * @param connection Client connection to be closed.
	 */
	goodbye(connection) {
		connection.rawConnection.end();
	}

	// ------------------------------------------------------------------------------------------------- [PRIVATE METHODS]

	/**
	 * Compile client JS.
	 *
	 * @returns {*}
	 * @private
	 */
	_compileClientJS() {
		let clientSource = fs
			.readFileSync(`${import.meta.dirname}/../client.js`)
			.toString();
		let url = this.api.config.servers.websocket.clientUrl;

		// replace any url by client url
		clientSource = clientSource.replace(/\'%%URL%%\'/g, url);

		let defaults = {};
		for (var i in this.api.config.servers.websocket.client) {
			defaults[i] = this.api.config.servers.websocket.client[i];
		}
		defaults.url = url;

		// append the number of simultaneous connections allowed
		defaults.simultaneousActions = this.api.config.general.simultaneousActions;

		let defaultsString = util.inspect(defaults);
		defaultsString = defaultsString.replace(
			"'window.location.origin'",
			"window.location.origin",
		);
		clientSource = clientSource.replace(`"%%DEFAULTS%%"`, defaultsString);

		// remove ESM export
		clientSource = clientSource.replace("export {};", "");

		return clientSource;
	}

	/**
	 * Render client JS.
	 *
	 * @param minimize
	 * @returns {*}
	 * @private
	 */
	_renderClientJs(minimize = false) {
		let libSource = this.server.library();
		let clientSource = this._compileClientJS();

		clientSource = `;;;\r\n` +
			`(function(exports){ \r\n${clientSource}\r\n` +
			`exports.StellarClient = StellarClient; \r\n` +
			`})(typeof exports === 'undefined' ? window : exports);`;

		// minify the client lib code using Uglify
		if (minimize) {
			return UglifyJS.minify(`${libSource}\r\n\r\n\r\n${clientSource}`).code;
		}

		return `${libSource}\r\n\r\n\r\n${clientSource}`;
	}

	/**
	 * Write client js code.
	 */
	_writeClientJS() {
		// ensure the public folder exists
		if (
			!this.api.utils.directoryExists(`${this.api.config.general.paths.public}`)
		) {
			this.api.utils.createFolder(`${this.api.config.general.paths.public}`);
		}

		if (this.api.config.servers.websocket.clientJsName) {
			let base = path.normalize(
				this.api.config.general.paths.public +
					path.sep +
					this.api.config.servers.websocket.clientJsName,
			);

			try {
				fs.writeFileSync(`${base}.js`, this._renderClientJs(false));
				this.api.log(`write ${base}.js`, "debug");
				fs.writeFileSync(`${base}.min.js`, this._renderClientJs(true));
				this.api.log(`wrote ${base}.min.js`, "debug");
			} catch (e) {
				this.api.log(
					"Cannot write client-side JS for websocket server:",
					"warning",
				);
				this.api.log(e, "warning");
				throw e;
			}
		}
	}

	/**
	 * Handle connection.
	 *
	 * @param rawConnection   Raw connection object.
	 * @private
	 */
	_handleConnection(rawConnection) {
		const fingerPrint = rawConnection.query[
			this.api.config.servers.web.fingerprintOptions.cookieKey
		];

		this.buildConnection({
			rawConnection: rawConnection,
			remoteAddress: rawConnection.address.ip,
			remotePort: rawConnection.address.port,
			fingerprint: fingerPrint,
		});
	}

	/**
	 * Handle the disconnection event.
	 *
	 * @param rawConnection
	 * @private
	 */
	_handleDisconnection(rawConnection) {
		for (let i in this.connections()) {
			if (
				this.connections()[i] &&
				rawConnection.id === this.connections()[i].rawConnection.id
			) {
				this.connections()[i].destroy();
				break;
			}
		}
	}

	_handleData(connection, data) {
		let verb = data.event;
		delete data.event;

		connection.messageCount++;
		connection.params = {};

		switch (verb) {
			case "action":
				for (let v in data.params) {
					connection.params[v] = data.params[v];
				}

				connection.error = null;
				connection.response = {};
				this.processAction(connection);
				break;

			case "file":
				// setup the connection parameters
				connection.params = {
					file: data.file,
				};

				// process the file request
				this.processFile(connection);
				break;

			default: {
				let words = [];
				let message;

				if (data.room) {
					words.push(data.room);
					delete data.room;
				}

				for (let i in data) {
					words.push(data[i]);
				}

				connection.verbs(verb, words, (error, data) => {
					// if exists an error, send it to the client
					if (error) {
						message = { status: error, context: "response", data: data };
						this.sendMessage(connection, message);
						return;
					}

					message = { status: "OK", context: "response", data: data };
					this.sendMessage(connection, message);
				});
				break;
			}
		}
	}
}
