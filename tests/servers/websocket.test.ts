import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import Primus from "primus";

import Engine from "../../src/engine";
import { sleep } from "../../src/utils";
import { API } from "../../src/common/types/api.types.ts";
const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api: API;

// clients
let client1;
let client2;
let client3;

let url: string;

const localhosts = ["127.0.0.1", "::ffff:127.0.0.1", "::1"];

const connectClients = async () => {
	// get the StellarClient in scope
	const StellarClient = eval(api.servers.servers.websocket._compileClientJS());

	const Socket = api.servers.servers.websocket.server.Socket;
	const url = `http://localhost:${api.config.servers.web.port}`;
	const client1socket = new Socket(url);
	const client2socket = new Socket(url);
	const client3socket = new Socket(url);

	client1 = new StellarClient({}, client1socket);
	client2 = new StellarClient({}, client2socket);
	client3 = new StellarClient({}, client3socket);
	await sleep(100);
};

describe("Servers: Web Socket", function () {
	beforeAll(async () => {
		api = await engine.start();

		// set the server url
		url = `http://localhost:${api.config.servers.web.port}`;
		api.config.servers.websocket.clientUrl = `http://localhost:${api.config.servers.web.port}`;

		await connectClients();
	});

	afterAll(() => engine.stop());

	it("socket client connections should work: client 1", async () => {
		const data = await client1.connect();
		expect(data).toMatchObject({
			totalActions: 0,
		});
		expect(client1.welcomeMessage).toBe("Hello human! Welcome to Stellar");
	});

	it("socket client connections should work: client 2", async () => {
		const data = await client2.connect();

		expect(data).toMatchObject({
			totalActions: 0,
		});
		expect(client2.welcomeMessage).toBe("Hello human! Welcome to Stellar");
	});

	it("socket client connections should work: client 3", async () => {
		const data = await client3.connect();

		expect(data).toMatchObject({
			totalActions: 0,
		});
		expect(client3.welcomeMessage).toBe("Hello human! Welcome to Stellar");
	});

	it("can get connection details", async () => {
		const response = await client1.detailsView();

		expect(response.data.connectedAt).toBeLessThan(new Date().getTime());
		expect(localhosts).toContain(response.data.remoteIP);
	});

	it("can run actions with errors", async () => {
		await expect(client1.action("cacheTest")).rejects.toMatchObject({
			error: {
				key: "The key field is required.",
			},
		});
	});

	it("can run actions properly", async () => {
		const response = await client1.action("randomNumber");
		expect(response.error).toBeUndefined();
	});

	it("does not have sticky params", async () => {
		const response = await client1.action("cacheTest", {
			key: "testKey",
			value: "testValue",
		});
		expect(response.error).toBeUndefined();

		expect(response).toMatchObject({
			cacheTestResults: {
				loadResp: {
					key: "cache_test_testKey",
					value: "testValue",
				},
			},
		});

		await expect(client1.action("cacheTest")).rejects.toMatchObject({
			error: {
				key: "The key field is required.",
			},
		});
	});

	it("can not call private actions", async () => {
		await expect(client1.action("sumANumber", { a: 3, b: 4 })).rejects.toMatchObject({
			error: {
				code: "002",
			},
		});
	});

	it("can execute namespaced actions", async () => {
		const response = await client1.action("isolated.action");
		expect(response.error).toBeUndefined();
		expect(response.success).toBe("ok");
	});

	// We are using the Stellar Client library, so we must the able to call over the limit of simultaneous connections
	// because we have a mechanism that keep a queue os pending requests
	it("will limit how many simultaneous connections a client can have", async () => {
		const responses: Record<string, unknown>[] = [];
		client1.action("sleep", { sleepDuration: 100 }).then((response) => responses.push(response));
		client1.action("sleep", { sleepDuration: 200 }).then((response) => responses.push(response));
		client1.action("sleep", { sleepDuration: 300 }).then((response) => responses.push(response));
		client1.action("sleep", { sleepDuration: 400 }).then((response) => responses.push(response));
		client1.action("sleep", { sleepDuration: 500 }).then((response) => responses.push(response));
		client1.action("sleep", { sleepDuration: 600 }).catch((response) => responses.push(response));

		await sleep(1000);

		expect(responses).toHaveLength(6);
		for (const index in responses) {
			const response = responses[index];
			if (index.toString() === "0") {
				expect(response.error.message).toEqual("You have too many pending requests");
			} else {
				expect(response.error).toBeUndefined();
			}
		}
	});

	describe("interceptors", () => {
		afterEach(() => {
			// we must cleanup all interceptors after the call
			client1.interceptors = [];
		});

		it("can append new parameters", async () => {
			client1.interceptors.push((params, next) => {
				params.a = 3;
				params.b = 4;

				next();
			});

			const response = await client1.action("formattedSum");
			expect(response.formatted).toBe("3 + 4 = 7");
		});

		it("can return an object", async () => {
			client1.interceptors.push((params, next) => {
				next({ someKey: "someValue" });
			});

			await expect(client1.action("formattedSum")).resolves.toMatchObject({
				someKey: "someValue",
			});
		});

		it("can return an error", async () => {
			client1.interceptors.push((params, next) => {
				next(null, { message: "anBadError" });
			});

			await expect(client1.action("formattedSum")).rejects.toMatchObject({
				message: "anBadError",
			});
		});

		it("can change the response", async () => {
			client1.interceptors.push((params, next) => {
				next((response) => {
					response.additionalField = "awesomeCall";
				});
			});

			await expect(client1.action("formattedSum", { a: 3, b: 4 })).resolves.toMatchObject({
				additionalField: "awesomeCall",
			});
		});
	});

	describe("chat", () => {
		beforeAll(() => {
			api.chatRoom.addMiddleware({
				name: "join chat middleware",
				join(connection, room, callback) {
					api.chatRoom.broadcast({}, room, `I have entered the room: ${connection.id}`).then(() => {
						callback();
					});
				},
			});

			api.chatRoom.addMiddleware({
				name: "leave chat middleware",
				leave(connection, room, callback) {
					api.chatRoom.broadcast({}, room, `I have left the room: ${connection.id}`).then(() => {
						callback();
					});
				},
			});
		});

		afterAll(() => {
			api.chatRoom.middleware = {};
			api.chatRoom.globalMiddleware = [];
		});

		beforeEach(async () => {
			await client1.join("defaultRoom");
			await client2.join("defaultRoom");
			await client3.join("defaultRoom");
		});

		afterEach(async () => {
			await client1.leave("defaultRoom");
			await client2.leave("defaultRoom");
			await client3.leave("defaultRoom");
			await client1.leave("otherRoom");
			await client2.leave("otherRoom");
			await client3.leave("otherRoom");
		});

		it("can change rooms and get room details", async () => {
			await client1.join("otherRoom");
			const response = await client1.detailsView();

			expect(response.error).toBeUndefined();
			expect(response.data.rooms[0]).toBe("defaultRoom");
			expect(response.data.rooms[1]).toBe("otherRoom");

			const { data } = await client1.roomView("otherRoom");
			expect(data.membersCount).toBe(1);
		});

		it("will update client info when they change rooms", async () => {
			expect(client1.rooms[0]).toBe("defaultRoom");
			expect(client1.rooms[1]).toBeUndefined();

			let response = await client1.join("otherRoom");
			expect(response.error).toBeUndefined();
			expect(client1.rooms[0]).toBe("defaultRoom");
			expect(client1.rooms[1]).toBe("otherRoom");

			response = await client1.leave("defaultRoom");
			expect(response.error).toBeUndefined();
			expect(client1.rooms[0]).toBe("otherRoom");
			expect(client1.rooms[1]).toBeUndefined();
		});

		it("clients can send/catch events", async () => {
			const listener = (data) => {
				client1.off("someEvent", listener);
				expect(data).toBe("Just A Message");
			};

			client1.on("someEvent", listener);
			client2.emit("someEvent", "Just A Message");
		});

		it("client can specify the target room", async () => {
			const listener = (data) => {
				client1.from("defaultRoom").off("someEvent", listener);
				expect(data).toBe("Just A Message");
			};

			client1.from("defaultRoom").on("someEvent", listener);
			client2.to("defaultRoom").emit("someEvent", "Just A Message");
		});

		it("clients can talk to each other", async () => {
			const listener = (response) => {
				client1.removeListener("say", listener);
				expect(response).toMatchObject({
					context: "user",
					message: {
						data: "hello from client 2",
					},
				});
			};

			client1.on("say", listener);
			client2.say("defaultRoom", "hello from client 2");
		});

		it("the client say method does not rely on order", async () => {
			await new Promise((resolve) => {
				const listener = (response) => {
					client1.removeListener("say", listener);
					expect(response).toMatchObject({
						context: "user",
						message: "hello from client 2",
					});

					resolve(null);
				};

				client2.say = (room, message, callback) => {
					client2.send(
						{
							message: message,
							room: room,
							event: "say",
						},
						callback,
					);
				};

				client1.on("say", listener);
				client2.say("defaultRoom", "hello from client 2");
			});
		});

		it("connections are notified when a client join a room", async () => {
			await new Promise(async (resolve) => {
				const listener = (response) => {
					client1.removeListener("say", listener);
					expect(response).toMatchObject({
						context: "user",
						message: `I have entered the room: ${client2.id}`,
					});

					resolve(null);
				};

				await client1.join("otherRoom");
				client1.on("say", listener);
				client2.join("otherRoom");
			});
		});

		it("connections are notified when a client leave a room", async () => {
			await new Promise((resolve) => {
				const listener = (response) => {
					client1.removeListener("say", listener);
					expect(response).toMatchObject({
						context: "user",
						message: `I have left the room: ${client2.id}`,
					});

					resolve(null);
				};

				client1.on("say", listener);
				client2.leave("defaultRoom");
			});
		});

		it("client will not get messages form other rooms", async () => {
			const response = await client2.join("otherRoom");
			expect(response.error).toBeUndefined();

			expect(client2.rooms.length).toBe(2);

			const listener = () => {
				client3.removeListener("say", listener);
				throw new Error("should not get here");
			};

			expect(client3.rooms.length).toBe(1);
			client3.on("say", listener);

			await sleep(1000);
			client3.removeListener("say", listener);

			client2.say("otherRoom", "you should not hear this");
		});

		it("connections can see member counts changing within rooms as folks join and leave", async () => {
			const response = await client1.roomView("defaultRoom");

			expect(response.data.membersCount).toBe(3);

			await client2.leave("defaultRoom");
			const response2 = await client1.roomView("defaultRoom");
			expect(response2.data.membersCount).toBe(2);
		});

		describe("middleware - say and onSay Receive", function () {
			beforeAll(async () => {
				await client1.join("defaultRoom");
				await client2.join("defaultRoom");
				await client3.join("defaultRoom");

				// timeout to skip welcome messages as clients join rooms
				await sleep(100);
			});

			afterAll(async () => {
				await client1.leave("defaultRoom");
				await client2.leave("defaultRoom");
				await client3.leave("defaultRoom");
			});

			afterEach(() => {
				api.chatRoom.middleware = {};
				api.chatRoom.globalMiddleware = [];
			});

			it("each listener receive custom message", async () => {
				api.chatRoom.addMiddleware({
					name: "say for each",
					say: (connection, room, messagePayload, callback) => {
						messagePayload.message += ` - To: ${connection.id}`;
						callback(null, messagePayload);
					},
				});

				const listener1 = (response) => {
					client1.removeListener("say", listener1);
					expect(response.message).toBe(`Test Message - To: ${client1.id}`);
				};

				const listener2 = (response) => {
					client2.removeListener("say", listener2);
					expect(response.message).toBe(`Test Message - To: ${client2.id}`);
				};

				const listener3 = (response) => {
					client3.removeListener("say", listener3);
					expect(response.message).toBe(`Test Message - To: ${client3.id}`);
				};

				client1.on("say", listener1);
				client2.on("say", listener2);
				client3.on("say", listener3);
				client2.say("defaultRoom", "Test Message");

				await sleep(1000);
			});

			it("only one message should be received per connection", async () => {
				let firstSayCall = true;

				api.chatRoom.addMiddleware({
					name: "first say middleware",
					say: (connection, room, messagePayload, callback) => {
						if (firstSayCall) {
							firstSayCall = false;

							setTimeout(() => {
								callback();
							}, 200);
						} else {
							callback();
						}
					},
				});

				let messageReceived = 0;
				const listener1 = () => {
					client1.removeListener("say", listener1);
					messageReceived += 1;
				};
				const listener2 = () => {
					client2.removeListener("say", listener2);
					messageReceived += 2;
				};
				const listener3 = () => {
					client3.removeListener("say", listener3);
					messageReceived += 4;
				};

				client1.on("say", listener1);
				client2.on("say", listener2);
				client3.on("say", listener3);
				client2.say("defaultRoom", "Test Message");

				await sleep(1000);

				expect(messageReceived).toBe(7);
			});
		});
	});

	describe("disconnect", function () {
		beforeEach(async () => {
			try {
				client1.disconnect();
				client2.disconnect();
				client3.disconnect();
			} catch (e) {}

			await connectClients();
			client1.connect();
			client2.connect();
			client3.connect();
			await sleep(500);
		});

		it("client can disconnect", async () => {
			expect(api.servers.servers.websocket.connections().length).toBe(3);

			client1.disconnect();
			client2.disconnect();
			client3.disconnect();

			await sleep(500);

			expect(api.servers.servers.websocket.connections().length).toBe(0);
		});

		it("can be sent disconnect events from the server", async () => {
			const response = await client1.detailsView();

			expect(localhosts).toContain(response.data.remoteIP);

			let count = 0;
			for (const id in api.connections.connections) {
				count++;
				api.connections.connections[id].destroy();
			}
			expect(count).toBe(3);

			client1.detailsView().then(() => {
				throw new Error("should not get response");
			});

			await sleep(500);
		});
	});
});
