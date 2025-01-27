import { isNotNil } from "ramda-adjunct";

const TCP_DEFAULT_PORT = 25001;

export default {
	servers: {
		tcp() {
			const isTcpServerEnabled = isNotNil(Deno.env.get("ENABLE_TCP_SERVER"));

			return {
				// ---------------------------------------------------------------------
				// Enable tcp server?
				// ---------------------------------------------------------------------
				enable: isTcpServerEnabled,

				// ---------------------------------------------------------------------
				// TCP or TLS?
				// ---------------------------------------------------------------------
				secure: false,

				// ---------------------------------------------------------------------
				// Server options
				//
				// passed to tls.createServer if secure=true, should contain SSL
				// certificates.
				// ---------------------------------------------------------------------
				serverOptions: {
					// ---------------------------------------------------------------------
					// Certificate to be used on the TLS connection
					// ---------------------------------------------------------------------
					// certFile: "server.crt",
					// ---------------------------------------------------------------------
					// Private key to be used on the TLS connection
					// ---------------------------------------------------------------------
					// keyFile: "server.key",
				},

				// ---------------------------------------------------------------------
				// Server port
				// ---------------------------------------------------------------------
				port: 5001,

				// ---------------------------------------------------------------------
				// IP to listen on
				//
				// Use 0.0.0.0 for all.
				// ---------------------------------------------------------------------
				bindIP: "0.0.0.0",

				// ---------------------------------------------------------------------
				// Enable TCP KeepAlive
				//
				// Send pings on each connection.
				// ---------------------------------------------------------------------
				setKeepAlive: false,

				// ---------------------------------------------------------------------
				// Delimiter string for incoming messages
				// ---------------------------------------------------------------------
				delimiter: "\n",

				// ---------------------------------------------------------------------
				// Maximum incoming message string length in Bytes (use 0 for Infinity)
				// ---------------------------------------------------------------------
				maxDataLength: 0,

				// ---------------------------------------------------------------------
				// What message to send down to a client who request a `quit`
				// ---------------------------------------------------------------------
				goodbyeMessage: "Bye!",
			};
		},
	},
};

export const test = {
	servers: {
		tcp() {
			const tcpPort = Deno.env.get("PORT");
			const vitestWorkerId = Deno.env.get("VITEST_WORKER_ID");

			return {
				enabled: true,
				port: tcpPort ?? TCP_DEFAULT_PORT + parseInt(vitestWorkerId ?? "0"),
				secure: false,
			};
		},
	},
};
