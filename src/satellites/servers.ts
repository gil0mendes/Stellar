import * as path from "@std/path";

/**
 * Manager for server instances.
 */
class Servers {
	/**
	 * Engine API instance.
	 * @type {null}
	 */
	api = null;

	/**
	 * Array with all running server instances.
	 *
	 * @type {{}}
	 */
	servers = {};

	/**
	 * Class constructor.
	 *
	 * @param api engine api instance.
	 */
	constructor(api) {
		this.api = api;
	}

	/**
	 * Load all servers.
	 */
	async loadServers() {
		// get the list of servers to load
		const serversFiles = this.api.utils.recursiveDirectoryGlob(path.resolve(`${import.meta.dirname}/../servers`));

		for (const file of serversFiles) {
			const parts = file.split(/[\/\\]+/);
			const serverName = parts[parts.length - 1].split(".")[0];

			// get server options if exists
			const options = this.api.config.servers[serverName];

			// only load the server if it's enabled
			if (options?.enable === true) {
				const { default: ServerConstructor } = await import(file);

				this.servers[serverName] = new ServerConstructor(this.api, options);
				this.api.log(`Initialized server: ${serverName}`, "debug");
			}
		}
	}

	/**
	 * Start all the existing servers.
	 */
	async startServers() {
		for (const serverName in this.servers) {
			const server = this.servers[serverName];

			// only load the server if the server is enabled
			if (server.options.enable !== true) {
				continue;
			}
			let message = `Starting server: ${serverName}`;

			// append the bind IP to log message
			if (this.api.config.servers[serverName].bindIP) {
				message += ` @ ${this.api.config.servers[serverName].bindIP}`;
			}

			// append the port to log message
			if (this.api.config.servers[serverName].port) {
				message += ` @ ${this.api.config.servers[serverName].port}`;
			}

			this.api.log(message, "notice");
			try {
				await server.start();
				this.api.log(`Server started: ${serverName}`, "debug");
			} catch (error) {
				this.api.log(`Failed to start server "${serverName}"`, "emerg", error);
			}
		}
	}

	/**
	 * Stop all running servers.
	 */
	async stopServers() {
		for (const serverName of Object.keys(this.servers)) {
			const server = this.servers[serverName];

			// check if the server are enable
			if ((server && server.options.enable === true) || !server) {
				this.api.log(`Stopping server: ${serverName}`, "notice");

				// call the server stop method
				await server.stop();
				this.api.log(`Server stopped ${serverName}`, "debug");
			}
		}
	}
}

export default class {
	/**
	 * This should be loaded after all engine
	 * loading satellites.
	 *
	 * @type {number}
	 */
	loadPriority = 550;

	startPriority = 900;

	stopPriority = 100;

	async load(api) {
		api.servers = new Servers(api);
		await api.servers.loadServers();
	}

	/**
	 * Satellite starting function.
	 *
	 * @param api   API object reference.
	 */
	async start(api) {
		await api.servers.startServers();
	}

	async stop(api) {
		await api.servers.stopServers();
	}
}
