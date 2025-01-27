/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { randomUUID } from "node:crypto";
import { sleep } from "../utils.ts";

/**
 * Redis manager class.
 *
 * This creates a interface to connect with a redis server.
 */
class RedisManager {
	/**
	 * API reference.
	 *
	 * @type {null}
	 */
	api = null;

	/**
	 * Hash with all instantiate clients.
	 *
	 * @type {{}}
	 */
	clients = {};

	/**
	 * Callbacks.
	 *
	 * @type {{}}
	 */
	clusterCallbacks = {};

	/**
	 * Cluster callback timeouts.
	 *
	 * @type {{}}
	 */
	clusterCallbackTimeouts = {};

	/**
	 * Subscription handlers.
	 *
	 * @type {{}}
	 */
	subscriptionHandlers = {};

	/**
	 * Redis manager status.
	 *
	 * @type {{subscribed: boolean}}
	 */
	status = {
		subscribed: false,
	};

	/**
	 * Constructor.
	 *
	 * @param api API reference.
	 */
	constructor(api) {
		// save api reference object
		this.api = api;

		// subscription handlers
		this.subscriptionHandlers["do"] = async (message) => {
			if (!message.connectionId || this.api.connections.connections[message.connectionId]) {
				const cmdParts = message.method.split(".");
				const cmd = cmdParts.shift();
				if (cmd !== "api") {
					throw new Error("cannot operate on a method outside of the api object");
				}

				// only allow to call the log method for security reasons
				const callableApi = Object.assign(api, { log: this.api.log });
				const method = this.api.utils.stringToHash(callableApi, cmdParts.join("."));

				let args = message.args ?? [];
				if (!Array.isArray(args)) {
					args = [args];
				}

				if (method) {
					const response = await method(...args);
					await this.respondCluster(message.messageId, response);
				} else {
					this.api.log(`RPC method '${cmdParts.join(".")}' not found`, "crit");
				}
			}
		};

		this.subscriptionHandlers["doResponse"] = (message) => {
			if (this.clusterCallbacks[message.requestId]) {
				clearTimeout(this.clusterCallbackTimeouts[message.requestId]);
				this.clusterCallbacks[message.requestId].apply(null, message.response);
				delete this.clusterCallbacks[message.requestId];
				delete this.clusterCallbackTimeouts[message.requestId];
			}
		};
	}

	async initialize() {
		const connectionNames = ["client", "subscriber", "tasks"];

		for (const r of connectionNames) {
			if (this.api.config.redis[r].buildNew === true) {
				const args = this.api.config.redis[r].args ?? [];

				this.clients[r] = new this.api.config.redis[r].constructor(args);

				this.clients[r].on("error", (error) => {
					this.api.log(`Redis connection '${r}' error`, "alert", error);
				});

				this.clients[r].on("connect", () => {
					this.api.log(`Redis connection '${r}' connected`, "debug");
				});

				this.clients[r].on("ready", () => {
					this.api.log(`Redis connection '${r}' ready`, "debug");
				});

				this.clients[r].on("close", () => {
					this.api.log(`Redis connection '${r}' closed`, "debug");
				});

				this.clients[r].on("end", () => {
					this.api.log(`Redis connection '${r}' ended`, "debug");
				});

				this.clients[r].on("reconnecting", () => {
					this.api.log(`Redis connection '${r}' reconnecting`, "info");
				});
			} else {
				this.clients[r] = this.api.config.redis[r].constructor(this.api.config.redis[r].args);

				this.clients[r].on("error", (error) => {
					this.api.log(`Redis connection '${r}' error`, "alert", error);
				});
				this.api.log(`Redis connection '${r}' connected`, "debug");
			}

			if (r !== "subscriber") {
				await this.clients[r].get("_test");
			}
		}

		if (!this.status.subscribed) {
			// ensures that clients subscribe the default channel
			await this.clients.subscriber.subscribe(this.api.config.general.channel);
			this.status.subscribed = true;

			const messageHandler = async (messageChannel, stringifiedMessage) => {
				let message;
				try {
					message = JSON.parse(stringifiedMessage);
				} catch (e) {
					message = {};
				}

				if (
					messageChannel === this.api.config.general.channel &&
					message.serverToken === this.api.config.general.serverToken
				) {
					if (this.subscriptionHandlers[message.messageType]) {
						this.subscriptionHandlers[message.messageType](message);
					}
				}
			};

			this.clients.subscriber.on("message", messageHandler);
		}
	}

	/**
	 * Publish a payload to the redis server.
	 *
	 * @param payload Payload to be published.
	 */
	async publish(payload) {
		const channel = this.api.config.general.channel;
		const connection = this.api.redis.clients.client;
		const stringPayload = JSON.stringify(payload);

		if (connection.status !== "close" && connection.status !== "end") {
			return connection.publish(channel, stringPayload);
		} else {
			this.api.log(`cannot send message, redis disconnected`, "error", {
				channel,
				payload,
			});
		}
	}

	// ------------------------------------------------------------------------------------------------------------- [RPC]

	/**
	 * Invoke a command on all servers in the cluster.
	 *
	 * @param {*} method
	 * @param {*} args
	 * @param {*} connectionId
	 * @param {*} waitForResponse
	 */
	async doCluster(method, args, connectionId, waitForResponse = false) {
		const requestId = randomUUID();
		const payload = {
			messageType: "do",
			serverId: this.api.id,
			serverToken: this.api.config.general.serverToken,
			requestId: requestId,
			method: method,
			connectionId: connectionId,
			args,
		};

		if (waitForResponse) {
			return new Promise(async (resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("RCP Timeout")), this.api.config.general.rpcTimeout);

				this.clusterCallbacks[requestId] = { timer, resolve, reject };
				try {
					await this.publish(payload);
				} catch (e) {
					clearTimeout(timer);
					delete this.clusterCallbacks[requestId];
					throw e;
				}
			});
		}

		return this.publish(payload);
	}

	async respondCluster(requestId, response) {
		const payload = {
			messageType: "doResponse",
			serverId: this.api.id,
			serverToken: this.api.config.general.serverToken,
			requestId: requestId,
			response: response, // args to pass back, including error
		};

		await this.publish(payload);
	}
}

/**
 * Redis initializer.
 */
export default class {
	/**
	 * Initializer load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 200;

	/**
	 * Initializer stop priority.
	 *
	 * @type {number}
	 */
	stopPriority = 99999;

	/**
	 * Initializer load method.
	 *
	 * @param api   API reference.
	 */
	async load(api) {
		api.redis = new RedisManager(api);
		await api.redis.initialize();
	}

	async start(api) {
		await api.redis.doCluster("api.log", [`Stellar member ${api.id} has joined the cluster`]);
	}

	/**
	 * Stop initializer.
	 *
	 * @param api   API reference.
	 */
	async stop(api) {
		await api.redis.clients.subscriber.unsubscribe();
		api.redis.status.subscribed = false;

		await api.redis.doCluster("api.log", [`Stellar member ${api.id} has left the cluster`]);

		// give sometime to allow the message to propagate though the cluster
		await sleep(api.config.redis.stopTimeout);

		const keys = Object.keys(api.redis.clients);
		for (const i in keys) {
			const client = api.redis.clients[keys[i]];

			if (typeof client.quit === "function") {
				await client.quit();
			} else if (typeof client.end === "function") {
				await client.end();
			} else if (typeof client.disconnect === "function") {
				await client.disconnect();
			}
		}

		// give some time to close the connection
		await sleep(api.config.redis.stopTimeout);
	}
}
