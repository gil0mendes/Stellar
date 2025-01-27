import GenericServer from "../genericServer.ts";
import { sleep } from "../utils.ts";
import { API } from "../common/types/api.types.ts";
import { isNil } from "ramda";
import { Connection } from "../connection.ts";
import { isEmptyString } from "ramda-adjunct";

const SERVER_TYPE = "tcp";

const attributes = {
	canChat: true,
	logConnections: true,
	logExits: true,
	pendingShutdownWaitLimit: 5000,
	sendWelcomeMessage: true,
	verbs: [
		"quit",
		"exit",
		"paramAdd",
		"paramDelete",
		"paramView",
		"paramsView",
		"paramsDelete",
		"roomJoin",
		"roomLeave",
		"roomView",
		"detailsView",
		"say",
		"event",
	],
};

const HEX_CODE_CTRL_C = "fff4fffd06";
const HEX_CODE_CTRL_D = "04";
/**
 * TCP server implementation.
 */
export default class Tcp extends GenericServer<Deno.TcpConn> {
	/**
	 * TCP server socket.
	 */
	server?: Deno.Listener;

	/**
	 * Create a new server instance.
	 *
	 * @param api       API object reference.
	 * @param options   Server options.
	 */
	constructor(api: API, options) {
		// call super constructor
		super(api, SERVER_TYPE, options, attributes);

		// define events
		this.#defineEvents();
	}

	// ------------------------------------------------------------------------------------------------ [Required Methods]

	/**
	 * Start server.
	 */
	override start() {
		try {
			this.server = this.options.secure ? this.createTCPServerWithTLS() : this.createTCPServer();
		} catch (error) {
			throw new Error(
				`Cannot start tcp server @ ${this.options.bindIP}:${this.options.port} => ${(error as Error).message}`,
			);
		}

		if (!this.server) {
			throw new Error("Unexpected error with the listener");
		}

		this.#startConnectionLoop(this.server);
	}

	/**
	 * Stop server.
	 */
	override stop() {
		return this.#gracefulShutdown();
	}

	/**
	 * Send a message to a client.
	 *
	 * @param connection    Client connection object.
	 * @param message       Message to be sent.
	 * @param messageCount  Number of messages already sent for this client.
	 */
	override sendMessage(connection: Connection<Deno.TcpConn>, message: Record<string, unknown>, messageCount?: number) {
		if (connection.destroyed) {
			this.api.log("socket write error, connection destroyed", "error");
			return;
		}

		// if is an error message serialize the object
		if (message.error) {
			message.error = this.api.config.errors.serializers.servers.tcp(message.error);
		}

		if (connection.respondingTo) {
			message.messageCount = messageCount;
			connection.respondingTo = null;
		} else if (message.context === "response") {
			message.messageCount = messageCount ?? connection.messageCount;
		}

		// try to send the message to the client
		try {
			const encoder = new TextEncoder();
			const encodedMessage = encoder.encode(`${JSON.stringify(message)}\r\n`);

			connection.rawConnection.write(encodedMessage);
		} catch (error) {
			this.api.log("socket write error", "error", error);
		}
	}

	/**
	 * Close the connection with the client sending a 'Bye!' message.
	 *
	 * @param connection  Client connection.
	 */
	override async goodbye(connection: Connection<Deno.TcpConn>, _reason: unknown) {
		try {
			await this.sendMessage(connection, {
				status: connection.localize(this.api.config.servers.tcp.goodbyeMessage),
				context: "api",
			});
			connection.rawConnection.close();
		} catch (_error) {
			// ignore error
		}
	}

	/**
	 * Send a file to the client.
	 *
	 * If the error is defined send a error message instead.
	 *
	 * @param connection  Client connection object.
	 * @param error       Error object.
	 * @param fileStream  FileStream object.
	 */
	sendFile(connection, error, fileStream) {
		// if is an error response send a message with the error
		if (error) {
			this.server.sendMessage(connection, error, connection.messageCount);
		} else {
			// send the file to client
			fileStream.pipe(connection.rawConnection, { end: false });
		}
	}

	// ---------------------------------------------------------------------------------------------------------- [Events]

	/**
	 * Define server events.
	 *
	 * @private
	 */
	#defineEvents() {
		// when we connect with the client we need to start a loop to deal with the messages
		this.on("connection", async (connection: Connection<Deno.TcpConn>) => {
			connection.params = {};

			// start processing messages sent over the TCP connection
			const decodedStream = connection.rawConnection.readable.pipeThrough(new TextDecoderStream());

			try {
				for await (const data of decodedStream) {
					this.#handleData(connection, data);
				}
			} catch (error) {
				if (!connection.destroyed) {
					this.log("server error", "error", error);
				}

				try {
					connection.rawConnection.close();
				} catch (_) {
					// no need to deal with this, that means the connections was already closed
				}

				connection.destroy();
			}

			// the connection was closed, ensure that we have the correct state for it
			if (connection.destroyed !== true) {
				try {
					connection.rawConnection.close();
				} catch (_) {
					// no need to deal with this, that means the connections was already closed
				}

				connection.destroy();
			}

			// connection.rawConnection.on("data", (chunk) => {
			// 	if (this.#checkBreakChars(chunk)) {
			// 		connection.destroy();
			// 	} else {
			// 		connection.rawConnection.socketDataString += chunk.toString("utf-8").replace(/\r/g, "\n");
			// 		let index;

			// 		// get delimiter
			// 		const delimiter = String(this.api.config.servers.tcp.delimiter);

			// 		while ((index = connection.rawConnection.socketDataString.indexOf(delimiter)) > -1) {
			// 			const data = connection.rawConnection.socketDataString.slice(0, index);
			// 			connection.rawConnection.socketDataString = connection.rawConnection.socketDataString.slice(
			// 				index + delimiter.length,
			// 			);
			// 			data.split(delimiter).forEach(parseLine);
			// 		}
			// 	}
			// });
		});

		// when a response for an action is ready we need to send it to the client
		this.on("actionComplete", (data) => {
			if (data.toRender === true) {
				data.response.context = "response";
				this.sendMessage(data.connection, data.response, data.messageCount);
			}
		});
	}

	// --------------------------------------------------------------------------------------------------------- [Helpers]

	/**
	 * Parse client request.
	 *
	 * @param connection  Client connection object.
	 * @param line        Request line to be parsed.
	 * @private
	 */
	#parseRequest(connection: Connection<Deno.TcpConn>, line: string) {
		const words = line.split(" ");

		// get the verb how are
		const verb = words.shift();

		if (verb === "file") {
			if (words.length > 0) {
				connection.params.file = words[0];
			}
			this.processFile(connection);
			return;
		}

		connection.verbs(verb, words, (error, data) => {
			// send an success response message, when there is no errors
			if (!error) {
				this.sendMessage(connection, {
					status: "OK",
					context: "response",
					data: data,
				});
				return;
			}

			if (error.code && error.code.match("014")) {
				// Error: Verb not found or not allowed
				// check for and attempt to check single-use params
				try {
					// parse JSON request
					const requestHash = JSON.parse(line);

					// pass all founded params to the connection object
					if (requestHash.params !== undefined) {
						connection.params = {};

						for (const v in requestHash.params) {
							connection.params[v] = requestHash.params[v];
						}
					}

					// pass action name to the connection object, if exists
					if (requestHash.action) {
						connection.params.action = requestHash.action;
					}
				} catch (e) {
					connection.params.action = verb;
				}

				// reset some connection properties
				connection.error = null;
				connection.response = {};

				// process actions
				this.processAction(connection);
				return;
			}

			// send an error message
			this.sendMessage(connection, {
				status: error,
				context: "response",
				data: data,
			});
		});
	}

	/**
	 * Handle new connection.
	 *
	 * @param rawConnection Client raw connection object.
	 * @private
	 */
	#handleConnection(rawConnection: Deno.Conn<Deno.Addr>) {
		// TODO: check what happens with a TLS connection
		const tcpRawConnection = rawConnection as Deno.TcpConn;

		// if `keepAlive` option is enabled, set it on the connection
		if (this.api.config.servers.tcp.setKeepAlive && "setKeepAlive" in rawConnection) {
			tcpRawConnection.setKeepAlive(true);
		}

		// build a new connection object (will emit 'connection')
		this.buildConnection({
			rawConnection: tcpRawConnection,
			remoteAddress: tcpRawConnection.remoteAddr.hostname,
			remotePort: tcpRawConnection.remoteAddr.port,
		});
	}

	/**
	 * Check if the chunk contains the break chars.
	 *
	 * @param chunk         Chunk to the be analyzed.
	 * @returns {boolean}   True if found, false otherwise.
	 */
	#checkBreakChars(chunk) {
		const hexChunk = chunk.toString("hex", 0, chunk.length);
		return [HEX_CODE_CTRL_C, HEX_CODE_CTRL_D].includes(hexChunk);
	}

	/**
	 * Try a graceful shutdown.
	 *
	 * We will wait a while to Stellar try response to the pending connections.
	 *
	 * @param alreadyShutdown   Informs if the server was already shutdown.
	 * @private
	 */
	async #gracefulShutdown(alreadyShutdown = false) {
		// if the server isn't already shutdown do it now
		if (!alreadyShutdown) {
			this.server?.close();
		}

		let pendingConnections = 0;

		// finish all pending connections
		this.connections().forEach((connection) => {
			// if there is no pending actions destroy the connection
			if (connection.pendingActions === 0) {
				connection.destroy();
				return;
			}

			// increment the pending connections
			pendingConnections++;

			if (!connection.rawConnection.shutDownTimer) {
				connection.rawConnection.shutDownTimer = setTimeout(() => {
					connection.destroy();
				}, attributes.pendingShutdownWaitLimit);
			}
		});

		if (pendingConnections > 0) {
			this.log(
				`waiting on shutdown, there are still ${pendingConnections} connected clients waiting on a response`,
				"notice",
			);

			await sleep(1000);
			this.#gracefulShutdown(true);
		}
	}

	/**
	 * Create TCP server.
	 */
	createTCPServer() {
		return Deno.listen({
			...this.api.config.servers.tcp.serverOptions,
			hostname: this.options.bindIP,
			port: this.options.port,
		});
	}

	/**
	 * Create TCP server over a TLS connection.
	 */
	createTCPServerWithTLS() {
		if (isNil(this.api.config.servers.tcp.serverOptions.certFile)) {
			throw new Error("servers.tcp.serverOptions.certFile is mandatory for using TCP with TLS");
		}

		if (isNil(this.api.config.servers.tcp.serverOptions.keyFile)) {
			throw new Error("servers.tcp.serverOptions.keyFile is mandatory for using TCP with TLS");
		}

		return Deno.listenTls({
			...this.api.config.servers.tcp.serverOptions,
			hostname: this.options.bindIP,
			port: this.options.port,
			transport: "tcp",
			cert: Deno.readTextFileSync(this.api.config.servers.tcp.serverOptions.certFile),
			key: Deno.readTextFileSync(this.api.config.servers.tcp.serverOptions.keyFile),
		});
	}

	/**
	 * Start connection loop to deal with new connection.
	 */
	async #startConnectionLoop(listener: Deno.Listener) {
		for await (const connection of listener) {
			this.#handleConnection(connection);
		}
	}

	/**
	 * Handle data sent by the client.
	 *
	 * @param connection Client connection object.
	 * @param data Data sent by the client.
	 */
	#handleData(connection: Connection<Deno.TcpConn>, data: string) {
		const dataLength = data.length;

		if (dataLength === 0) {
			return;
		}

		if (this.api.config.servers.tcp.maxDataLength > 0 && dataLength > this.api.config.servers.tcp.maxDataLength) {
			const error = this.api.config.errors.dataLengthTooLarge(this.api.config.servers.tcp.maxDataLength, dataLength);

			this.log(error, "error");
			this.sendMessage(connection, {
				status: "error",
				error: error,
				context: "response",
			});

			return;
		}

		// convert all the returns into a new line
		const normalizedData = data.replaceAll(/\r/g, "\n");

		// break the message into lines and process them individually
		const delimiter = String(this.api.config.servers.tcp.delimiter);
		const lines = normalizedData.split(delimiter);

		for (const line of lines) {
			if (isEmptyString(line)) {
				continue;
			}

			connection.messageCount += 1;
			this.#parseRequest(connection, line);
		}
	}
}
