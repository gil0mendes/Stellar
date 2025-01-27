export default {
	servers: {
		websocket() {
			return {
				// ---------------------------------------------------------------------
				// Enable the server?
				// ---------------------------------------------------------------------
				enable: true,

				// ---------------------------------------------------------------------
				// Client location.
				//
				// This can also be a FQDN.
				// ---------------------------------------------------------------------
				clientUrl: "window.location.origin",

				// ---------------------------------------------------------------------
				// The name of the client-side JS file to render.
				//
				// Both '.js' and '.min.js' versions will be created do not include the
				// file extension.
				// ---------------------------------------------------------------------
				clientJsName: "stellar-client",

				// ---------------------------------------------------------------------
				// Should the server signal clients to not reconnect when the server is
				// shutdown/reboot.
				// ---------------------------------------------------------------------
				destroyClientsOnShutdown: false,

				// ---------------------------------------------------------------------
				// WebSocket client options
				// ---------------------------------------------------------------------
				client: {
					// API base endpoint on your server
					apiPath: "/api",
					// Default room for the chat system
					defaultRoom: "defaultRoom",
				},

				// ---------------------------------------------------------------------
				// WebSocket server options
				// ---------------------------------------------------------------------
				server: {
					transformer: "websockets",
					// this disable Primus warning on cluster environments
					iknowclusterwillbreakconnections: true,
				},
			};
		},
	},
};

// FIXME: we need to fix the webserver code
export const test = {
	servers: {
		websocket: {
			enable: false,
		},
	},
};
