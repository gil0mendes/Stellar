import { normalize, sep } from "path";
import { ReadStream, readFileSync } from "fs";
import { BrowserFingerprint } from "browser_fingerprint";
import UglifyJS from "uglify-js";
import { inspect } from "util";
import Primus from "primus";
import { Server } from "http";
import { when } from "ramda";

import WebServer from "./web";
import { GenericServer } from "../base/generic-server";
import {
	always,
	Connection,
	io,
	ok,
	Result,
	safeWriteFile,
	unsafe,
	ConnectionDetails,
	LogLevel,
} from "@stellarfw/common";
import { stellarPkgPath } from "../engine";
import { isFalse } from "ramda-adjunct";

export default class WebSocketServer extends GenericServer {
	protected static serverName = "websocket";

	/**
	 * Primus server instance.
	 */
	private server!: Primus;

	private fingerprinter: any = null;

	constructor(api, options) {
		super(api, "websocket", options);
		this.attributes = {
			canChat: true,
			logConnections: true,
			logExists: true,
			sendWelcomeMessage: true,
			verbs: ["quit", "exit", "roomJoin", "roomLeave", "roomView", "detailsView", "say", "event"],
		};

		this.on("connection", this.handleNewConnection.bind(this));
		this.on("actionComplete", this.handleActionComplete.bind(this));

		this.fingerprinter = new BrowserFingerprint(this.api.configs.servers.web.fingerprintOptions);
	}

	private handleNewConnection(connection) {
		connection.rawConnection.on("data", (data) => {
			this.handleData(connection, data);
		});
	}

	private handleActionComplete(data: any): void {
		if (!data.toRender) {
			return;
		}

		data.connection.response.messageCount = data.messageCount;
		this.sendMessage(data.connection, data.response, data.messageCount);
	}

	/**
	 * Handle data received by this server.
	 *
	 * @param connection Client connection.
	 * @param data Received data.
	 */
	private async handleData(connection: ConnectionDetails, data: any): Promise<void> {
		const verb = data.event;
		delete data.event;

		connection.messageCount += 1;
		connection.params = {};

		switch (verb) {
			case "action":
				connection.params = {
					...connection.params,
					...data.params,
				};

				connection.error = undefined;
				connection.response = {};
				this.processAction(connection);
				break;
			case "file":
				connection.params = {
					file: data.file,
				};

				this.processFile(connection);
				break;
			default:
				let words: Array<any> = [];
				let message;

				if (data.room) {
					words = [...words, data.room];
					delete data.room;
				}

				// TODO: maybe convert this to a more ES7 way of doing things
				for (const index in data) {
					if (data.hasOwnProperty(index)) {
						words = [...words, data[index]];
					}
				}

				try {
					const response = await connection.verbs!(verb, words);
					message = { status: "OK", context: "response", data: response };
				} catch (error) {
					// TODO: check if we need the data object
					message = { status: error, context: "response" };
				}

				this.sendMessage(connection, message);
				break;
		}
	}

	/**
	 * Handle connection.
	 *
	 * @param rawConnection Raw connection object.
	 */
	private handleConnection(rawConnection): void {
		const parsedCookies = this.fingerprinter.parseCookies(rawConnection);
		const fingerprint = parsedCookies[this.api.configs.servers.web.fingerprintOptions.cookieKey];

		this.buildConnection({
			rawConnection,
			remoteAddress: rawConnection.address.ip,
			remotePort: rawConnection.address.port,
			fingerprint,
		});
	}

	/**
	 * Handle the disconnection event.
	 *
	 * @param rawConnection Raw connection.
	 */
	private handleDisconnection(rawConnection): void {
		const connections = this.connections();

		for (const i in connections) {
			if (connections[i] && rawConnection.id === connections[i].rawConnection.id) {
				connections[i].destroy();
				break;
			}
		}
	}

	/**
	 * Start the server.
	 */
	public async start(): Promise<void> {
		const webServer: WebServer = this.api.servers.servers.get("web");

		this.server = new Primus(webServer.server as Server, this.api.configs.servers.websocket.server);

		// Define the necessary event handlers
		this.server.on("connection", this.handleConnection.bind(this));
		this.server.on("disconnection", this.handleDisconnection.bind(this));

		this.api.log(`WebSocket bound to ${webServer.options.bindIP}:${webServer.options.port}`, LogLevel.Debug);

		(this.server as any).active = true;

		(await this.writeClientJS()).tapErr((errMsg) => this.api.log(errMsg, LogLevel.Warning));
	}

	/**
	 * Shutdown the websocket server.
	 */
	public async stop(): Promise<void> {
		(this.server as any).active = false;

		if (this.api.configs.servers.websocket.destroyClientOnShutdown === true) {
			this.connections().forEach((connection: Connection) => {
				connection.destroy!();
			});
		}
	}

	/**
	 * Send a message.
	 *
	 * @param connection Connection where the message must be sent.
	 * @param message Message to be sent.
	 * @param messageCount Message number.
	 */
	public sendMessage(connection: ConnectionDetails, message: any, messageCount: number | null = null) {
		if (message.error) {
			message.error = this.api.configs.errors.serializers.servers.websocket(message.error);
		}

		if (!message.context) {
			message.context = "response";
		}

		if (!messageCount) {
			messageCount = connection.messageCount;
		}

		if (message.context === "response" && !message.messageCount) {
			message.messageCount = messageCount;
		}

		connection.rawConnection.write(message);
	}

	/**
	 * Action to be execution on the goodbye.
	 *
	 * @param connection Client connection to be closed.
	 */
	public goodbye(connection: ConnectionDetails) {
		connection.rawConnection.end();
	}

	/**
	 * Action to be execution on a file request.
	 *
	 * @param connection Client connection object.
	 * @param error Error, if exists.
	 * @param stream FileStream
	 * @param mime Mime type.
	 * @param length File size.
	 * @param lastModified Last file modification timestamp.
	 */
	public async sendFile(
		connection: ConnectionDetails,
		error: Error | null = null,
		fileStream: ReadStream,
		mime: string,
		length: number,
		lastModified: Date,
	): Promise<void> {
		let content = "";
		const response = {
			error,
			content: null as string | null,
			mime,
			length,
			lastModified,
		};

		try {
			if (!error) {
				fileStream.on("data", (d) => {
					content += d;
				});

				fileStream.on("end", () => {
					response.content = content;
					// TODO: review this sendMessage method. Seems not to be present on Primus anymore
					// @ts-ignore
					this.server.sendMessage(connection, response, connection.messageCount);
				});
			}

			// @ts-ignore
			this.server.sendMessage(connection, response, connection.messageCount);
		} catch (e) {
			this.api.log(e, "warning");
			// @ts-ignore
			this.server.sendMessage(connection, response, connection.messageCount);
		}
	}

	/**
	 * Compile client JS.
	 */
	private compileClientJs(): string {
		// TODO: find a way to compile into JS or maybe move into an external module
		let clientSource: string = readFileSync(`${stellarPkgPath}/client.ts`).toString();
		const url: string = this.api.configs.servers.websocket.clientUrl;

		clientSource = clientSource.replace(/\'%%URL%%\'/g, url);

		const defaults = {
			...this.api.configs.servers.websocket.client,
			url,
			// Append the number of simultaneous connections allowed
			simultaneousActions: this.api.configs.general.simultaneousActions,
		};

		let defaultsString: string = inspect(defaults);
		defaultsString = defaultsString.replace("'window.location.origin'", "window.location.origin");
		clientSource = clientSource.replace("'%%DEFAULTS%%'", defaultsString);

		return clientSource;
	}

	/**
	 * Render client JS.
	 *
	 * @param minimize Should we enable minification?
	 */
	private renderClientJs(minimize = false): Result<string, string> {
		const libSource = this.server?.library();
		const clientSource = this.compileClientJs();

		const wrappedSource = `
      ;;;\r\n
      (function (exports){ \r\n
        ${clientSource} \r\n
        exports.Stellar = Stellar;\r\n
      })(typeof exports === 'undefined' ? window : exports);
    `;

		if (minimize) {
			return io(() => unsafe<string>(() => UglifyJS.minify(`${libSource}\r\n\r\n\r\n${wrappedSource}`).code)).run();
		}

		return ok(`${libSource}\r\n\r\n\r\n${wrappedSource}`);
	}

	/**
	 * Write client JS code.
	 */
	private async writeClientJS(): Promise<Result<null, string>> {
		// Ensure the public folder exists
		const createPublicDir = () => this.api.utils.createDir(`${this.api.configs.general.paths.public}`).run();

		await this.api.utils
			.dirExists(`${this.api.configs.general.paths.public}`)
			.map(async (result) => when(isFalse, createPublicDir, await result))
			.run();

		if (this.api.configs.servers.websocket.clientJsName) {
			const base = normalize(
				this.api.configs.general.paths.public + sep + this.api.configs.servers.websocket.clientJsName,
			);

			// write uncompressed library
			const uncompressedResult = this.renderClientJs(false)
				.mapErr(always("Cannot write uncompressed client-side library"))
				.map((code) => safeWriteFile(`${base}.js`, code).run())
				.andThen(() => {
					this.api.log(`write ${base}.js`, LogLevel.Debug);
					return ok(null);
				});

			if (uncompressedResult.isErr()) {
				return uncompressedResult;
			}

			// write compressed library
			// TODO: before doing minification we need to find a way to compile the TS into JS
			// return this.renderClientJs(true)
			// 	.mapErr(always("Cannot write compressed client-side library"))
			// 	.map((code) => safeWriteFile(`${base}.min.js`, code).run())
			// 	.andThen(() => {
			// 		this.api.log(`wrote ${base}.min.js`, LogLevel.Debug);
			// 		return ok(null);
			// 	});
		}

		return ok(null);
	}
}
