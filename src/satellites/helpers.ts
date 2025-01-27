/* eslint-disable @typescript-eslint/ban-ts-comment */
import { randomUUID } from "node:crypto";
import GenericServer from "../genericServer.ts";

class TestServer extends GenericServer {
	constructor(api, type, options, attributes) {
		super(api, type, options, attributes);

		this.on("connection", (connection) => {
			connection.messages = [];
			connection.actionCallbacks = {};
		});

		this.on("actionComplete", (data) => {
			data.response.messageCount = data.messageCount;
			data.response.serverInformation = {
				serverName: api.config.general.serverName,
				apiVersion: api.config.general.apiVersion,
			};

			data.response.requesterInformation = {
				id: data.connection.id,
				remoteIP: data.connection.remoteIP,
				receivedParams: {},
			};

			if (data.response.error) {
				data.response.error = api.config.errors.serializers.servers.helper(data.response.error);
			}

			for (const k in data.params) {
				data.response.requesterInformation.receivedParams[k] = data.params[k];
			}

			if (data.toRender === true) {
				this.sendMessage(data.connection, data.response, data.messageCount);
			}
		});
	}

	start() {
		this.api.log("loading the testServer", "warning");
	}

	stop(next) {
		next();
	}

	sendMessage(connection, message, messageCount) {
		process.nextTick(() => {
			message.messageCount = messageCount;
			connection.messages.push(message);

			if (typeof connection.actionCallbacks[messageCount] === "function") {
				connection.actionCallbacks[messageCount](message, connection);
				delete connection.actionCallbacks[messageCount];
			}
		});
	}

	goodbye() {}
}

class Helpers {
	/**
	 * API reference object.
	 *
	 * @type {null}
	 */
	api = null;

	/**
	 * Create a new instance of Helpers class.
	 *
	 * @param api
	 */
	constructor(api) {
		this.api = api;
	}

	connection() {
		const id = randomUUID();

		this.api.servers.servers.testServer.buildConnection({
			id: id,
			rawConnection: {},
			remoteAddress: "testServer",
			remotePort: 0,
		});

		return this.api.connections.connections[id];
	}

	initialize(api, options) {
		const type = "testServer";
		const attributes = {
			canChat: true,
			logConnections: false,
			logExits: false,
			sendWelcomeMessage: true,
			verbs: api.connections.allowedVerbs,
		};

		return new TestServer(api, type, options, attributes);
	}

	/**
	 * Run an action.
	 *
	 * This creates a fake connection to process the action
	 * and return the result on the callback function.
	 *
	 * @param actionName  Action to be executed.
	 * @param input       Action parameters.
	 */
	runAction(actionName, input) {
		let connection;

		if (typeof input === "function" && !next) {
			next = input;
			input = {};
		}

		if (input.id && input.type === "testServer") {
			connection = input;
		} else {
			connection = this.connection();
			connection.params = input;
		}
		connection.params.action = actionName;

		connection.messageCount++;

		return new Promise((resolve) => {
			connection.actionCallbacks[connection.messageCount] = resolve;
			this.api.servers.servers.testServer.processAction(connection);
		});
	}

	/**
	 * Execute a task.
	 *
	 * @param taskName  Task to be executed.
	 * @param params    Task parameters.
	 * @param next      Callback function.
	 */
	runTask(taskName, params, next) {
		this.api.tasks.tasks[taskName].run(this.api, params, next);
	}
}

export default class {
	/**
	 * Satellite load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 800;

	/**
	 * Satellite start priority.
	 *
	 * @type {number}
	 */
	startPriority = 800;

	/**
	 * Satellite loading function.
	 *
	 * @param api   API object reference.
	 */
	async load(api) {
		if (api.env === "test") {
			api.helpers = new Helpers(api);
		}
	}

	/**
	 * Satellite starting function.
	 *
	 * @param api   API object reference.
	 */
	async start(api) {
		if (api.env === "test") {
			const serverObject = api.helpers.initialize(api, {});
			api.servers.servers.testServer = serverObject;
			await api.servers.servers.testServer.start();
		}
	}
}
