import qs from "qs";
import * as path from "@std/path";

import Mime from "mime";
import GenericServer from "../genericServer.ts";
import { sleep } from "../utils.ts";
import { API } from "../common/types/api.types.ts";
import { HttpFingerprint } from "../fingerprint/httpFingerprint.ts";
import { Connection } from "../connection.ts";
import { ActionProcessor, RequesterInformation } from "../common/types/action-processor.ts";
import { deflate, gzip } from "@deno-library/compress";
import { eTag, STATUS_CODE } from "@std/http";
import { HEADER } from "@std/http/unstable-header";
import { FileDescriptor, GetFileResponse } from "../common/types/static-file.interface.ts";
import { METHOD } from "@std/http/unstable-method";
import { processRequestData } from "../utils/form-data.ts";

// server type
const type = "web";

/**
 * HTTP methods.
 */
type HTTPMethod =
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE"
	| "HEAD"
	| "OPTIONS"
	| "TRACE";

/**
 * Requests modes support by this HTTP sever.
 */
type RequestMode = "api" | "file" | "options" | "client-lib" | "trace";

export type HttpConnection = {
	req: Request;
	params: Record<string, unknown>;
	method: HTTPMethod;
	parsedURL: URL;
	cookies: Record<string, string>;
	response: {
		headers: Headers;
		statusCode: number;
	};

	/**
	 * Promise and resolvers to complete the connection.
	 */
	completePromise: PromiseWithResolvers<Response>;
};

// server attributes
const attributes = {
	canChat: false,
	logConnections: false,
	logExits: false,
	sendWelcomeMessage: false,
	verbs: [
		// no verbs for connections of this type, as they are to very short-lived
	],
};

/**
 * This implements the HTTP web server.
 */
export default class Web extends GenericServer<HttpConnection> {
	/**
	 * Abortion controller to stop the server.
	 */
	abortionController?: AbortController;

	/**
	 * HTTP server instance.
	 */
	server?: Deno.HttpServer<Deno.NetAddr>;

	/**
	 * Allows to produce a fingerprint for the caller.
	 */
	fingerprinter: HttpFingerprint;

	/**
	 * Constructor.
	 *
	 * @param api       api instance.
	 * @param options   map with the server options.
	 */
	constructor(api: API, options) {
		// call the super constructor
		super(api, type, options, attributes);

		this.fingerprinter = new HttpFingerprint(
			this.api.config.servers.web.fingerprintOptions,
		);

		if (
			["api", "file"].indexOf(this.api.config.servers.web.rootEndpointType) < 0
		) {
			throw new Error(
				"api.config.servers.web.rootEndpointType can only be 'api' or 'file'.",
			);
		}

		// -------------------------------------------------------------------------------------------------------- [EVENTS]
		this.on("connection", (connection: Connection<HttpConnection>) => {
			this.#determineRequestParams(connection, (requestMode: RequestMode) => {
				switch (requestMode) {
					case "api":
						this.processAction(connection);
						break;
					case "file":
						this.processFile(connection);
						break;
					case "options":
						this.#respondToOptions(connection);
						break;
					case "client-lib":
						this.#processClientLib(connection);
						break;
					case "trace":
						this.#respondToTrace(connection);
				}
			});
		});

		this.on(
			"actionComplete",
			(actionProcessor: ActionProcessor<HttpConnection>) => {
				this.#completeResponse(actionProcessor);
			},
		);
	}

	// ------------------------------------------------------------------------------------------------ [REQUIRED METHODS]

	/**
	 * Start the server instance.
	 */
	override async start() {
		// Use the HTTP or HTTPS server based on the provided configuration
		// if (this.options.secure) {
		// 	const https = await import("node:https");
		// 	this.server = https.createServer(this.api.config.servers.web.serverOptions, (req, res) => {
		// 		this.#handleRequest(req, res);
		// 	});
		// } else {
		// 	const http = await import("node:http");
		// 	this.server = http.createServer((req, res) => {
		// 		this.#handleRequest(req, res);
		// 	});
		// }

		// TODO: add support for HTTPS

		this.abortionController = new AbortController();

		await this.#createHttpServer((request, info) => this.#handleRequest(request, info));
	}

	/**
	 * Stop server.
	 */
	override stop() {
		this.abortionController?.abort();

		return this.server?.finished;
	}

	/**
	 * Send a message to the client.
	 *
	 * @param connection  Connection object where the message must be sent.
	 * @param message     Message to be sent.
	 */
	override sendMessage(
		connection: Connection<HttpConnection>,
		message: string,
	): Response {
		const stringResponse = connection.rawConnection.method === "HEAD" ? "" : message;

		this.#cleanHeaders(connection);

		const headers = connection.rawConnection.response.headers;
		const responseStatusCode = connection.rawConnection.response.statusCode;

		return this.#buildStringResponseWithCompression(
			connection,
			responseStatusCode,
			headers,
			stringResponse,
		);
	}

	/**
	 * Send a file to the client.
	 *
	 * @param connection      Connection object where the file must be sent.
	 * @param error           Error object, null if not exists.
	 * @param fileStream      FileStream for the requested file.
	 * @param mime            File mime type.
	 * @param length          File length in bytes.
	 * @param lastModified    Timestamp if the last modification.
	 */
	override async sendFile(
		fileResponse: GetFileResponse<HttpConnection>,
	) {
		const error = fileResponse.error;
		const connection = fileResponse.connection;

		// If the cache control header is set we must use cache mechanics
		const foundCacheControl = connection.rawConnection.response.headers.has(HEADER.CacheControl);

		// add mime type to the response headers
		connection.rawConnection.response.headers.set(HEADER.ContentType, fileResponse.mime);

		// When the cache header isn't present we need to set it
		if (fileResponse.fileDescriptor && !foundCacheControl) {
			connection.rawConnection.response.headers.set(
				"Cache-Control",
				`max-age=${this.api.config.servers.web.flatFileCacheDuration}, must-revalidate, public`,
			);
		}

		// add a header to the response with the last modified timestamp
		if (fileResponse.fileDescriptor && !this.api.config.servers.web.enableEtag) {
			if (fileResponse.fileDescriptor.lastModified) {
				connection.rawConnection.response.headers.set(
					HEADER.LastModified,
					fileResponse.fileDescriptor.lastModified.toUTCString(),
				);
			}
		}

		// clean the connection headers
		this.#cleanHeaders(connection);

		const reqHeaders = connection.rawConnection.req.headers;
		const resHeaders = connection.rawConnection.response.headers;

		// This function is used to send the response to the client.
		const sendRequestResult = () => {
			let response;
			const responseStatusCode = connection.rawConnection.response.statusCode;

			if (error) {
				const errorString = error instanceof Error ? String(error) : JSON.stringify(error);

				response = this.#buildStringResponseWithCompression(
					connection,
					responseStatusCode,
					resHeaders,
					errorString,
				);
			} else if (responseStatusCode !== STATUS_CODE.NotModified) {
				using fileDescriptor = fileResponse.fileDescriptor;

				response = this.#buildResponseWithCompression(
					connection,
					responseStatusCode,
					resHeaders,
					fileDescriptor,
					fileResponse.length,
				);
			} else {
				response = new Response(null, { status: responseStatusCode, headers: resHeaders });
			}

			connection.rawConnection.completePromise.resolve(response);
		};

		// if an error exists change the status code to 404 and send the response
		if (error) {
			connection.rawConnection.response.statusCode = STATUS_CODE.NotFound;
			return sendRequestResult();
		}

		// get the 'if-modified-since' value if exists
		if (fileResponse.fileDescriptor && reqHeaders.has(HEADER.IfModifiedSince)) {
			const lastModified = fileResponse.fileDescriptor?.lastModified;
			const ifModifiedSince = new Date(reqHeaders.get(HEADER.IfModifiedSince)!);

			lastModified.setMilliseconds(0);
			if (lastModified <= ifModifiedSince) {
				connection.rawConnection.response.statusCode = STATUS_CODE.NotModified;
			}

			return sendRequestResult();
		}

		// If the ETags are enabled we need to implement the entity tag mechanism
		if (
			this.api.config.servers.web.enableEtag && fileResponse.fileDescriptor
		) {
			// Get the file states in order to create the ETag header
			try {
				const fileStats = await fileResponse.fileDescriptor.file.stat();

				// push the ETag header to the response
				const fileEtag = await eTag(fileStats, { weak: true });
				if (fileEtag) {
					connection.rawConnection.response.headers.set(HEADER.ETag, fileEtag);
				}

				const noneMatchHeader = reqHeaders.get(HEADER.IfNoneMatch);
				const cacheCtrlHeader = reqHeaders.get(HEADER.CacheControl);

				const noCache = cacheCtrlHeader && cacheCtrlHeader.includes("no-cache");
				let etagMatches;

				// parse if-none-match
				let noneMatchHeaderParts: string[] = [];
				if (noneMatchHeader) {
					noneMatchHeaderParts = noneMatchHeader.split(/ *, */);
				}

				// if-none-match
				if (noneMatchHeaderParts) {
					etagMatches = noneMatchHeaderParts.some(
						(match) => match === "*" || match === fileEtag || match === `W/${fileEtag}`,
					);
				}

				// use the cached object
				if (etagMatches && !noCache) {
					connection.rawConnection.response.statusCode = STATUS_CODE.NotModified;
				}
			} catch (error) {
				this.log(`Error receiving file statistics`, "error", error);
				return sendRequestResult();
			}
		}

		sendRequestResult();
	}

	#buildStringResponseWithCompression(
		connection: Connection<HttpConnection>,
		statusCode: number,
		headers: Headers,
		stringResponse: string,
	): Response {
		let responseBytes = new TextEncoder().encode(stringResponse);

		// apply compression if it's enabled and it was requested
		const acceptEncoding = connection.rawConnection.req.headers.get(
			HEADER.AcceptEncoding,
		);
		if (this.api.config.servers.web.compress) {
			if (acceptEncoding?.match(/\bdeflate\b/)) {
				headers.set(HEADER.ContentEncoding, "deflate");
				responseBytes = deflate(responseBytes);
			} else if (acceptEncoding?.match(/\bgzip\b/)) {
				headers.set(HEADER.ContentEncoding, "gzip");
				responseBytes = gzip(responseBytes);
			}
		}

		headers.set(HEADER.ContentLength, responseBytes.byteLength.toString());

		return new Response(responseBytes, {
			headers,
			status: statusCode,
		});
	}

	/**
	 * Send a compressed message to the client.
	 *
	 * @param connection          Connection object where the message must be sent.
	 * @param statusCode    HTTP Status code.
	 * @param headers             HTTP response headers.
	 * @param fileDescriptor          FileStream, only needed if to send a file.
	 * @param fileLength          File size in bytes, only needed if is to send a file.
	 */
	async #buildResponseWithCompression(
		connection: Connection<HttpConnection>,
		statusCode: number,
		headers: Headers,
		fileDescriptor: FileDescriptor,
		fileLength: number,
	) {
		const acceptEncoding = connection.rawConnection.req.headers.get(
			HEADER.AcceptEncoding,
		);

		// read the bytes from the file
		let bytes = new Uint8Array(fileLength);
		await fileDescriptor?.file.read(bytes);

		// Note: this is not a conformant accept-encoding parser.
		// https://nodejs.org/api/zlib.html#zlib_zlib_createinflate_options
		// See http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.3
		if (this.api.config.servers.web.compress === true) {
			if (acceptEncoding?.match(/\bdeflate\b/)) {
				hasCompress = true;
				headers.set(HEADER.ContentEncoding, "deflate");
				bytes = deflate(bytes);
			} else if (acceptEncoding?.match(/\bgzip\b/)) {
				hasCompress = true;
				headers.set(HEADER.ContentEncoding, "gzip");
				bytes = gzip(bytes);
			}
		}

		headers.set(HEADER.ContentLength, String(fileLength));
		return new Response(bytes, {
			status: statusCode,
			headers,
		});
	}

	/**
	 * Disconnect a client.
	 *
	 * @param connection
	 */
	override goodbye() {
		// disconnect handlers
	}

	// --------------------------------------------------------------------------------------------------------- [PRIVATE]

	/**
	 * Handle the requests.
	 *
	 * @param req   Request object.
	 */
	async #handleRequest(
		req: Request,
		info: Deno.ServeHandlerInfo<Deno.NetAddr>,
	): Promise<Response> {
		const headers = new Headers();
		const completionSignal = Promise.withResolvers<Response>();

		// get the client fingerprint
		const { fingerprint, headersHash } = await this.fingerprinter.fingerprint(
			req,
			info,
		);

		const cookies = this.api.utils.parseCookies(req);
		const responseHttpCode = STATUS_CODE.OK;
		const method = req.method.toUpperCase() as HTTPMethod;
		// TODO: check if we need something better as a default base
		const parsedURL = new URL(req.url, "http://localhost");

		// add all cookies from the request into the response
		for (const headerName in headersHash) {
			headers.append(headerName, headersHash[headerName]);
		}

		// set content type to JSON
		headers.set(HEADER.ContentType, "application/json; charset=utf-8");

		// push all the default headers to the response object
		for (const headerName in this.api.config.servers.web.httpHeaders) {
			headers.append(
				headerName,
				this.api.config.servers.web.httpHeaders[headerName],
			);
		}

		// get client connection details
		let remoteHostname = info.remoteAddr.hostname;
		let remotePort = info.remoteAddr.port;

		// helpers for unix socket bindings with no forward
		if (!remoteHostname && !remotePort) {
			remoteHostname = "0.0.0.0";
			remotePort = 0;
		}

		if (req.headers.has("x-forwarded-for")) {
			let parts;
			let forwardedIp = req.headers.get("x-forwarded-for")!.split(",")[0];
			if (
				forwardedIp.indexOf(".") >= 0 ||
				(forwardedIp.indexOf(".") < 0 && forwardedIp.indexOf(":") < 0)
			) {
				// IPv4
				forwardedIp = forwardedIp.replace("::ffff:", ""); // remove any IPv6 information, ie: '::ffff:127.0.0.1'
				parts = forwardedIp.split(":");
				if (parts[0]) {
					remoteHostname = parts[0];
				}
				if (parts[1]) {
					remotePort = parseInt(parts[1], 10);
				}
			} else {
				// IPv6
				parts = this.api.utils.parseIPv6URI(forwardedIp);
				if (parts.host) {
					remoteHostname = parts.host;
				}
				if (parts.port) {
					remotePort = parts.port;
				}
			}

			if (req.headers.has("x-forwarded-port")) {
				const rawPort = req.headers.get("x-forwarded-port")!;
				remotePort = parseInt(rawPort, 10);
			}
		}

		const connection = this.buildConnection({
			rawConnection: {
				req: req,
				params: {},
				method: method,
				cookies: cookies,
				parsedURL: parsedURL,
				completePromise: completionSignal,
				response: {
					statusCode: responseHttpCode,
					headers,
				},
			},
			id: `${fingerprint}-${crypto.randomUUID()}`,
			fingerprint,
			remoteHostname,
			remotePort,
		});

		const response = await completionSignal.promise;

		// cleanup internal connection
		connection.destroy();

		return response;
	}

	/**
	 * Change socket permission.
	 *
	 * @param bindIP  IP here socket is listening.
	 * @param port    Port that socket is listening.
	 */
	#chmodSocket(bindIP: string, port: string) {
		if (!bindIP && port.indexOf("/") >= 0) {
			Deno.chmodSync(port, 0o777);
		}
	}

	/**
	 * Determine the request params.
	 *
	 * @param connection  Client connection object.
	 * @param callback    Callback function.
	 */
	async #determineRequestParams(connection: Connection<HttpConnection>, callback) {
		const url = connection.rawConnection.parsedURL;
		const pathname = url.pathname;

		// determine if is a file or an api request
		let requestMode = this.api.config.servers.web.rootEndpointType;
		const pathParts = pathname.split("/");
		let matcherLength, i;

		// remove empty parts from the beginning of the path
		while (pathParts[0] === "") {
			pathParts.shift();
		}

		// if exist an empty part on the end of the path, remove it
		if (pathParts[pathParts.length - 1] === "") {
			pathParts.pop();
		}

		if (
			pathParts[0] &&
			pathParts[0] === this.api.config.servers.web.urlPathForActions
		) {
			requestMode = "api";
			pathParts.shift();
		} else if (
			pathParts[0] &&
			pathParts[0] === this.api.config.servers.websocket.clientJsName
		) {
			requestMode = "client-lib";
			pathParts.shift();
		} else if (
			pathParts[0] &&
			pathParts[0] === this.api.config.servers.web.urlPathForFiles
		) {
			requestMode = "file";
			pathParts.shift();
		} else if (
			pathParts[0] &&
			pathname.indexOf(this.api.config.servers.web.urlPathForActions) === 0
		) {
			requestMode = "api";
			matcherLength = this.api.config.servers.web.urlPathForActions.split("/").length;
			for (i = 0; i < matcherLength - 1; i++) {
				pathParts.shift();
			}
		} else if (
			pathParts[0] &&
			pathname.indexOf(this.api.config.servers.web.urlPathForFiles) === 0
		) {
			requestMode = "file";
			matcherLength = this.api.config.servers.web.urlPathForFiles.split("/").length;
			for (i = 0; i < matcherLength - 1; i++) {
				pathParts.shift();
			}
		}

		// split parsed URL by '.'
		const extensionParts = connection.rawConnection.parsedURL.pathname.split(
			".",
		);
		if (extensionParts.length > 1) {
			connection.extension = extensionParts[extensionParts.length - 1];
		}

		// OPTIONS
		if (connection.rawConnection.method === "OPTIONS") {
			requestMode = "options";
			callback(requestMode);
		} else if (requestMode === "api") {
			// API
			// enable trace mode
			if (connection.rawConnection.method === "TRACE") {
				requestMode = "trace";
			}

			const searchString = url.search.slice(1);
			const queryStringParameters = qs.parse(
				searchString,
				this.api.config.servers.web.queryParseOptions,
			);
			this.#fillParamsFromWebRequest(connection, queryStringParameters);

			// copy the raw search params into the connection
			connection.rawConnection.params.query = Object.fromEntries(
				url.searchParams,
			);

			if (
				connection.rawConnection.method !== METHOD.Get &&
				connection.rawConnection.method !== METHOD.Head &&
				(connection.rawConnection.req.headers.has(HEADER.ContentType) ||
					connection.rawConnection.req.headers.has(HEADER.ContentType))
			) {
				try {
					const { files, fields } = await processRequestData(
						connection.rawConnection.req,
						this.api.config.servers.web.formOptions,
					);
					connection.rawConnection.params.body = fields;
					connection.rawConnection.params.files = files;

					this.#fillParamsFromWebRequest(connection, files);
					this.#fillParamsFromWebRequest(connection, fields);
				} catch (error) {
					this.log(`error processing form`, "error", error);
					connection.error = new Error(
						"There was an error processing this form.",
					);
				}

				if (this.api.config.servers.web.queryRouting !== true) {
					connection.params.action = null;
				}

				this.api.routes.processRoute(connection, pathParts);

				return callback(requestMode);
			} else {
				if (this.api.config.servers.web.queryRouting !== true) {
					connection.params.action = null;
				}

				this.api.routes.processRoute(connection, pathParts);

				return callback(requestMode);
			}
		} else if (requestMode === "file") {
			if (!connection.params.file) {
				connection.params.file = pathParts.join(path.SEPARATOR);
			}

			if (
				connection.params.file === "" ||
				connection.params.file[connection.params.file.length - 1] === "/"
			) {
				connection.params.file = connection.params.file +
					this.api.config.general.directoryFileType;
			}
			callback(requestMode);
		} else if (requestMode === "client-lib") {
			callback(requestMode);
		}
	}

	#processClientLib(connection: Connection<HttpConnection>) {
		// client lib
		const file = path.normalize(
			`${
				this.api.config.general.paths.public + path.SEPARATOR +
				this.api.config.servers.websocket.clientJsName
			}.js`,
		);

		// define the file to be loaded
		connection.params.file = file;

		// process like a file
		this.processFile(connection);
	}

	/**
	 * Fill the connection with the web request params.
	 *
	 * @param connection  Connection object.
	 * @param varsHash    Request params.
	 */
	#fillParamsFromWebRequest(
		connection: Connection<HttpConnection>,
		varsHash: Record<string, string>,
	) {
		// helper for JSON parts
		const collapsedVarsHash = this.api.utils.collapseObjectToArray(varsHash);

		if (collapsedVarsHash !== false) {
			// post was an array, lets call it "payload"
			varsHash = { payload: collapsedVarsHash };
		}

		// copy requests params to connection object
		for (const v in varsHash) {
			connection.params[v] = varsHash[v];
		}
	}

	/**
	 * Complete the response.
	 *
	 * THis add additional server info to the response message, and
	 * build the final response object.
	 *
	 * @param data  Data to be sent to the client.
	 * @private
	 */
	#completeResponse(data: ActionProcessor<HttpConnection>) {
		if (!data.toRender) {
			data.connection.rawConnection.completePromise.promise.then(() => data.connection.destroy());

			return;
		}

		if (this.api.config.servers.web.metadataOptions.serverInformation) {
			const stopTime = new Date().getTime();

			data.response.serverInformation = {
				serverName: this.api.config.general.serverName,
				apiVersion: this.api.config.general.apiVersion,
				requestDuration: stopTime - data.connection.connectedAt,
				currentTime: stopTime,
			};
		}

		// check if is to use requester information
		if (this.api.config.servers.web.metadataOptions.requesterInformation) {
			data.response.requesterInformation = this.#buildRequesterInformation(
				data.connection,
			);
		}

		// is an error response?
		if (data.response.error) {
			if (
				this.api.config.servers.web.returnErrorCodes === true &&
				data.connection.rawConnection.response.statusCode === STATUS_CODE.OK
			) {
				if (data.actionStatus === "unknown_action") {
					data.connection.rawConnection.response.statusCode = STATUS_CODE.NotFound;
				} else if (data.actionStatus === "missing_params") {
					data.connection.rawConnection.response.statusCode = STATUS_CODE.UnprocessableEntity;
				} else if (data.actionStatus === "server_error") {
					data.connection.rawConnection.response.statusCode = STATUS_CODE.InternalServerError;
				} else {
					data.connection.rawConnection.response.statusCode = STATUS_CODE.BadRequest;
				}
			}
		}

		if (
			!data.response.error &&
			data.action &&
			data.params.apiVersion &&
			this.api.actions.actions[data.params.action][data.params.apiVersion]
					.matchExtensionMimeType === true &&
			data.connection.extension
		) {
			data.connection.rawConnection.response.headers.set(
				HEADER.ContentType,
				Mime.getType(data.connection.extension),
			);
		}

		// if its an error response we need to serialize the error object
		if (data.response.error) {
			data.response.error = this.api.config.errors.serializers.servers.web(
				data.response.error,
			);
		}

		let stringResponse = "";

		if (
			this.#extractHeader(data.connection, HEADER.ContentType)?.match(/json/)
		) {
			try {
				stringResponse = JSON.stringify(
					data.response,
					null,
					this.api.config.servers.web.padding,
				);
			} catch (_) {
				data.connection.rawConnection.response.statusCode = STATUS_CODE.InternalServerError;
				stringResponse = JSON.stringify({
					error: "invalid_response_object",
					requesterInformation: this.#buildRequesterInformation(
						data.connection,
					),
				});
			}

			if (data.params.callback) {
				data.connection.rawConnection.response.headers.set(
					HEADER.ContentType,
					"application/javascript",
				);
				stringResponse = `${data.connection.params.callback}(${stringResponse});`;
			}
		} else {
			stringResponse = String(data.response);
		}

		// Get the response object and resolve the request with it.
		const response = this.sendMessage(data.connection, stringResponse);
		data.connection.rawConnection.completePromise.resolve(response);
	}

	/**
	 * Extract one header from a connection object.
	 *
	 * @param connection  Connection object from the header must be extracted.
	 * @param targetName  Header name.
	 */
	#extractHeader(
		connection: Connection<HttpConnection>,
		targetName: string,
	): string | null {
		const headers = connection.rawConnection.response.headers;

		for (const [headerName, headerValue] of headers.entries()) {
			if (headerName.toLowerCase() === targetName.toLowerCase()) {
				return headerValue;
			}
		}

		return null;
	}

	/**
	 * Build the requester information.
	 *
	 * @param connection
	 */
	#buildRequesterInformation(
		connection: Connection<HttpConnection>,
	): RequesterInformation {
		const requesterInformation: RequesterInformation = {
			id: connection.id,
			fingerprint: connection.fingerprint,
			remoteHostname: connection.remoteHostname,
			receivedParams: {},
		};

		// copy all the connection params to the request information
		for (const param in connection.params) {
			requesterInformation.receivedParams[param] = connection.params[param];
		}

		return requesterInformation;
	}

	/**
	 * Remove some unnecessary headers from the response.
	 *
	 * @param connection  Client connection object.
	 */
	#cleanHeaders(connection: Connection<HttpConnection>) {
		const originalHeaders = connection.rawConnection.response.headers.entries();
		const foundHeaders = [];

		// iterate all headers and remove duplications and unnecessary headers
		for (const [key, value] of originalHeaders) {
			if (
				foundHeaders.indexOf(key.toLowerCase()) >= 0 &&
				key.toLowerCase().indexOf("set-cookie") < 0
			) {
				// ignore, it's a duplicate
			} else if (
				connection.rawConnection.method === "HEAD" &&
				key === "Transfer-Encoding"
			) {
				// ignore, we can't send this header for HEAD requests
			} else {
				foundHeaders.push(key.toLowerCase());
				connection.rawConnection.response.headers.set(key, value);
			}
		}
	}

	/**
	 * Respond to an option request.
	 *
	 * @param connection  Connection object.
	 * @private
	 */
	#respondToOptions(connection: Connection<HttpConnection>) {
		// inform the allowed methods
		if (
			!this.api.config.servers.web
				.httpHeaders[HEADER.AccessControlAllowMethods] &&
			!this.#extractHeader(connection, HEADER.AccessControlAllowMethods)
		) {
			const methods = "HEAD, GET, POST, PUT, DELETE, OPTIONS, TRACE";
			connection.rawConnection.response.headers.set(HEADER.AccessControlAllowMethods, methods);
		}

		// inform the allowed origins
		if (
			!this.api.config.servers.web
				.httpHeaders[HEADER.AccessControlAllowOrigin] &&
			!this.#extractHeader(connection, HEADER.AccessControlAllowOrigin)
		) {
			const origin = "*";
			connection.rawConnection.response.headers.set(
				HEADER.AccessControlAllowOrigin,
				origin,
			);
		}

		const response = this.sendMessage(connection, "");
		connection.rawConnection.completePromise.resolve(response);
	}

	/**
	 * Respond to a trace request.
	 *
	 * @param connection  Client connection object.
	 * @private
	 */
	#respondToTrace(connection: Connection<HttpConnection>) {
		// build the request information
		const data = this.#buildRequesterInformation(connection);

		// build the response string and send it to the client
		const stringResponse = JSON.stringify(
			data,
			null,
			this.api.config.servers.web.padding,
		);
		this.sendMessage(connection, stringResponse);
	}

	/**
	 * Try remove the stale unix socket.
	 *
	 * @param bindIP
	 * @param port
	 * @private
	 */
	async #cleanSocket(bindIP: string, port: string) {
		if (!bindIP && port.indexOf("/") >= 0) {
			try {
				await Deno.remove(port);
				this.log(`removed stale unix socket @${port}`);
			} catch (error) {
				this.log(`cannot remove stale socket @${port}`, "error", error);
			}
		}
	}

	async #createHttpServer(handler: Deno.ServeHandler<Deno.NetAddr>) {
		let isBooted = false;
		let bootAttempts = 1;

		while (!isBooted) {
			bootAttempts += 1;

			try {
				// TODO: add support for TLS
				this.server = Deno.serve(
					{
						port: this.options.port,
						hostname: this.options.bindIP,
						signal: this.abortionController?.signal,
					},
					handler,
				);
				isBooted = true;
				this.#chmodSocket(this.options.bindIP, this.options.port);
			} catch (error) {
				if (bootAttempts < this.api.config.servers.web.bootAttempts) {
					this.log(`cannot boot web server; trying again`, "error", error);
				} else {
					throw new Error(
						`Cannot start web server @ ${this.options.bindIP}:${this.options.port} -> ${(error as Error).message}`,
					);
				}

				// on the first attempt try to clean the socket
				if (bootAttempts === 1) {
					await this.#cleanSocket(this.options.bindIP, this.options.port);
				}

				// stop for a while to give time to the system perform any cleanup action
				await sleep(1000);
			}
		}
	}
}
