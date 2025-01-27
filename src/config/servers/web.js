export default {
	servers: {
		web(api) {
			return {
				// ---------------------------------------------------------------------
				// Enable server?
				// ---------------------------------------------------------------------
				enable: true,

				// ---------------------------------------------------------------------
				// HTTPS
				//
				// If this property are defined to false we will use a regular HTTP
				// connection, otherwise we use a secure HTTPS connection.
				// ---------------------------------------------------------------------
				secure: false,

				// ---------------------------------------------------------------------
				// This config map is passed to the https.createServer method.
				//
				// This is only used if we are using a secure connection. This should
				// contains the SSL certificate.
				// ---------------------------------------------------------------------
				serverOptions: {},

				// ---------------------------------------------------------------------
				// This is the IP who will be used to listen the web socket.
				//
				// If this property are defined to '0.0.0.0' we listen for all on the
				// IPv4 and IPv6.
				// ---------------------------------------------------------------------
				bindIP: "0.0.0.0",

				// ---------------------------------------------------------------------
				// Port ot Socket Path.
				//
				// This options can be overwrited withe PORT param on the console
				// execution.
				// ---------------------------------------------------------------------
				port: process.env.PORT || 8080,

				// ---------------------------------------------------------------------
				// This are the headers who are sended on all Stellar responses.
				//
				// By default this tells CORS to allow request from any origin.
				// ---------------------------------------------------------------------
				httpHeaders: {
					"X-Powered-By": api.config.general.serverName,
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods":
						"HEAD, GET, POST, PUT, PATCH, DELETE, OPTIONS, TRACE",
					"Access-Control-Allow-Headers": "Content-Type",
				},

				// ---------------------------------------------------------------------
				// Define the route that actions will be served from.
				//
				// Using a call format like REST is treated as an action call too.
				// IE: /api?action=generateNumber == /api/generateNumber
				// ---------------------------------------------------------------------
				urlPathForActions: "api",

				// ---------------------------------------------------------------------
				// Route that static files will be served from.
				//
				// path relative to project root to server static content from, set to
				// `null` to disable the file server entirely.
				// ---------------------------------------------------------------------
				urlPathForFiles: "public",

				// ---------------------------------------------------------------------
				// When visiting the root URL, should visitors see 'api' or 'file'?
				//
				// Visitors can always visit /api and /public as normal.
				// ---------------------------------------------------------------------
				rootEndpointType: "file",

				// ---------------------------------------------------------------------
				// Simple routing also adds an 'all' route which matches /api/:action
				// for all actions.
				// ---------------------------------------------------------------------
				simpleRouting: true,

				// ---------------------------------------------------------------------
				// Query Routing allows an action to be defined via a URL param.
				//
				// ex: /api?action=:action
				// ---------------------------------------------------------------------
				queryRouting: true,

				// ---------------------------------------------------------------------
				// Header which will be returned for all flat file (defined in seconds)
				// ---------------------------------------------------------------------
				flatFileCacheDuration: 60,

				// ---------------------------------------------------------------------
				// This define the many times the Stellar should try boot the server.
				//
				// This might happen if the port is in use by another process or the
				// socketfile is claimed.
				// ---------------------------------------------------------------------
				bootAttempts: 1,

				// ---------------------------------------------------------------------
				// Settings for determining the ID of an http(s) request
				// (http-fingerprint)
				// ---------------------------------------------------------------------
				fingerprintOptions: {
					cookieKey: "sessionID",
					toSetCookie: true,
					settings: {
						path: "/",
						expires: 3600000,
					},
				},

				// ---------------------------------------------------------------------
				// Options to be applied to incoming file uploads.
				// ---------------------------------------------------------------------
				formOptions: {
					uploadDir: Deno.makeTempDir("stellar_uploads_"),
					keepExtensions: false,
					maxFieldsSize: 1024 * 1024 * 100,
				},

				// ---------------------------------------------------------------------
				// Enable JSON padding to make more human-readable.
				//
				// Set to null to disable.
				// ---------------------------------------------------------------------
				padding: 2,

				// ---------------------------------------------------------------------
				// Options to configure metadata in responses
				// ---------------------------------------------------------------------
				metadataOptions: {
					serverInformation: true,
					requesterInformation: true,
				},

				// ---------------------------------------------------------------------
				// When true, will modify the response header if connection.error is not
				// null.
				//
				// Is also possible set connection.rawConnection.responseHttpCode to
				// specify a code per request.
				// ---------------------------------------------------------------------
				returnErrorCodes: true,

				// ---------------------------------------------------------------------
				// Use GZIP (compression) on the server responses.
				//
				// This only works when the client accept them. This also will slow down
				// the performance of Stellar, and if you need this feature, it is
				// recommended that you do this upstream with nginx or on a load
				// balancer.
				// ---------------------------------------------------------------------
				compress: false,

				// ---------------------------------------------------------------------
				// Options to pass to the query parser.
				//
				// All options available at https://github.com/hapijs/qs
				// ---------------------------------------------------------------------
				queryParseOptions: {},

				// ---------------------------------------------------------------------
				// ETAG Header
				//
				// When true, an ETAG Header will be provided with each requested static
				// file for caching reasons.
				// ---------------------------------------------------------------------
				enableEtag: true,
			};
		},
	},
};

export const test = {
	servers: {
		web() {
			return {
				port: process.env.PORT
					? process.env.PORT
					: 18080 + parseInt(process.env.VITEST_WORKER_ID || "0"),
			};
		},
	},
};
