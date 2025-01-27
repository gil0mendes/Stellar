import { Connection } from "../connection.ts";

/**
 * Create a clean connection.
 *
 * @param connection  Connection object.
 * @returns {{}}      New clean connection object.
 */
const cleanConnection = (connection) => {
	const clean = {};

	for (let i in connection) {
		if (i !== "rawConnection") {
			clean[i] = connection[i];
		}
	}

	return clean;
};

class Connections {
	/**
	 * API reference object.
	 */
	api;

	/**
	 * Hash with all registered middleware.
	 *
	 * @type {{}}
	 */
	middleware = {};

	/**
	 * Array with global middleware.
	 *
	 * @type {Array}
	 */
	globalMiddleware = [];

	/**
	 * Array with the allowed verbs.
	 *
	 * @type {string[]}
	 */
	allowedVerbs = [
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
	];

	/**
	 * Hash with the active connections.
	 *
	 * @type {{}}
	 */
	connections = {};

	/**
	 * Create a new class instance.
	 *
	 * @param api   API object reference.
	 */
	constructor(api) {
		this.api = api;
	}

	/**
	 * Add a new middleware.
	 *
	 * @param data  Middleware to be added.
	 */
	addMiddleware(data) {
		// middleware require a name
		if (!data.name) {
			throw new Error("middleware.name is required");
		}

		// if there is no defined priority use the default
		if (!data.priority) {
			data.priority = this.api.config.general.defaultMiddlewarePriority;
		}

		// ensure the priority is a number
		data.priority = Number(data.priority);

		// save the new middleware
		this.middleware[data.name] = data;

		// push the new middleware to the global list
		this.globalMiddleware.push(data.name);

		// sort the global middleware array
		this.globalMiddleware.sort((a, b) => {
			if (this.middleware[a].priority > this.middleware[b].priority) {
				return 1;
			}

			return -1;
		});
	}

	apply(connectionId, method, args, callback) {
		if (args === undefined && callback === undefined && typeof method === "function") {
			callback = method;
			args = null;
			method = null;
		}

		this.api.redis._doCluster("api.connections.applyCatch", [connectionId, method, args], connectionId, callback);
	}

	applyCatch(connectionId, method, args, callback) {
		const connection = this.api.connections.connections[connectionId];

		if (method && args) {
			if (method === "sendMessage" || method === "sendFile") {
				connection[method](args);
			} else {
				connection[method].apply(connection, args);
			}
		}

		if (typeof callback === "function") {
			process.nextTick(() => {
				callback(cleanConnection(connection));
			});
		}
	}
}

export default class {
	/**
	 * Satellite load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 400;

	/**
	 * Satellite load function.
	 *
	 * @param api   API reference object.
	 */
	load(api) {
		api.connections = new Connections(api);
		api.connection = Connection;
	}
}
