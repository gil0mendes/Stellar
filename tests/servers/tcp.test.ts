import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { assertSpyCall, spy } from "@std/testing/mock";
import { assert } from "@std/assert";

import Engine from "../../src/engine.ts";
import { randomUUID } from "node:crypto";
import { API } from "../../src/common/types/api.types.ts";
import { head } from "ramda";
import { sleep } from "../../src/utils.ts";
import { assertRejects } from "jsr:@std/assert@^1.0.10/rejects";

/**
 * Time to wait for a response, in ms.
 */
const TIMEOUT = 3000;

const engine = new Engine({ rootPath: `${Deno.cwd()}/example` });

let api: API;

// TCP instance clients
let client1: Deno.TcpConn;
let client2: Deno.TcpConn;
let client3: Deno.TcpConn;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const readSocket = async (client: Deno.TcpConn, delimiter = "\r\n") => {
	let timerId: number = 0;

	// create a timeout promise for when the server doesn't respond in time
	const timeoutPromise = new Promise<Uint8Array>((_, reject) => {
		timerId = setTimeout(() => reject(new Error("Timeout reached")), TIMEOUT);
	});

	// create read promise
	const readPromise = (async () => {
		const buffer = new Uint8Array(1024);
		const n = await client.read(buffer);
		if (n === null) {
			throw new Error("Connection closed by the server");
		}

		return buffer.slice(0, n);
	})();

	const rawData = await Promise.race([readPromise, timeoutPromise]);

	// cancel timeout timer
	clearTimeout(timerId);

	const data = decoder.decode(rawData);
	const splittedResponse = data.split(delimiter);
	const response = head(splittedResponse);

	assert(response, "we need at least one response");

	let parsed;
	try {
		parsed = JSON.parse(response);
	} catch (_) {
		// The message isn't a JSON so return the data
		return response;
	}

	// throw an exception when the server response it's an error
	if ("error" in parsed) {
		throw parsed.error;
	}

	return parsed;
};

/**
 * This function allows to make a socket request.
 *
 * @param client      Client object.
 * @param message     Message to be sent.
 * @param delimiter   Message delimiter, by default `\r\n`
 */
const makeSocketRequest = (client: Deno.TcpConn, message: string, delimiter = "\r\n") => {
	// send the new message
	const encodedMessage = encoder.encode(`${message}${delimiter}`);
	client.write(encodedMessage);

	return readSocket(client, delimiter);
};

const connectClients = async () => {
	client1 = await Deno.connect({
		port: api.config.servers.tcp.port,
		transport: "tcp",
	});
	// Script welcome message
	await readSocket(client1);

	client2 = await Deno.connect({
		port: api.config.servers.tcp.port,
		transport: "tcp",
	});
	// Script welcome message
	await readSocket(client2);

	client3 = await Deno.connect({
		port: api.config.servers.tcp.port,
		transport: "tcp",
	});
	// Script welcome message
	await readSocket(client3);
};

describe("Servers: TCP", function () {
	beforeAll(async () => {
		api = await engine.start();

		await connectClients();
	});

	afterAll(async () => {
		client1.close();
		client2.close();
		client3.close();

		await engine.stop();
	});

	it("connections should be able to connect and get JSON", async () => {
		await expect(makeSocketRequest(client1, "hello")).rejects.toMatchObject({
			code: "004",
		});
	});

	it("single string message are treated as actions", async () => {
		await expect(makeSocketRequest(client1, "status")).resolves.toMatchObject({
			id: "test-server",
		});
	});

	it("stringified JSON can also be send as actions", async () => {
		await expect(
			makeSocketRequest(client1, JSON.stringify({ action: "status", params: { somethings: "example" } })),
		).resolves.toMatchObject({ id: "test-server" });
	});

	it("can not call private actions", async () => {
		await expect(
			makeSocketRequest(client1, JSON.stringify({ action: "sumANumber", params: { a: 3, b: 4 } })),
		).rejects.toMatchObject({
			code: "002",
		});
	});

	it("can execute namespaced actions", async () => {
		await expect(makeSocketRequest(client1, JSON.stringify({ action: "isolated.action" }))).resolves.toMatchObject({
			success: "ok",
		});
	});

	it("really long messages are OK", async () => {
		// build a long message using v4 UUIDs
		const value = Array(10)
			.map(() => randomUUID())
			.join("");
		const msg = {
			action: "cacheTest",
			params: {
				key: randomUUID(),
				value,
			},
		};

		await expect(makeSocketRequest(client1, JSON.stringify(msg))).resolves.toMatchObject({
			cacheTestResults: {
				loadResp: {
					key: `cache_test_${msg.params.key}`,
					value,
				},
			},
		});
	});

	it("client can get their details", async () => {
		const response = await makeSocketRequest(client2, "detailsView");

		expect(response.status).toBe("OK");
		expect(response.data).toBeDefined();
		expect(response.data.params).toBeDefined();
	});

	it("params can update", async () => {
		await makeSocketRequest(client1, "paramAdd key=otherKey");
		await expect(makeSocketRequest(client1, "paramsView")).resolves.toMatchObject({
			status: "OK",
			data: {
				key: "otherKey",
			},
		});
	});

	it("actions will fail without params set to the connection", async () => {
		await makeSocketRequest(client1, "paramDelete key");
		await expect(makeSocketRequest(client1, "cacheTest")).rejects.toMatchObject({
			key: "The key field is required.",
		});
	});

	it("can add individual parameters and call the action", async () => {
		// create a parameter
		await expect(makeSocketRequest(client1, "paramAdd key=testKey")).resolves.toMatchObject({
			status: "OK",
		});

		// view the parameter
		await expect(makeSocketRequest(client1, "paramView key")).resolves.toMatchObject({
			data: "testKey",
		});

		// add another parameter
		await expect(makeSocketRequest(client1, "paramAdd value=test123")).resolves.toMatchObject({
			status: "OK",
		});

		// Call the action
		await expect(makeSocketRequest(client1, "cacheTest")).resolves.toMatchObject({
			cacheTestResults: {
				saveResp: true,
			},
		});

		// params are sticky between actions
		await expect(makeSocketRequest(client1, "cacheTest")).resolves.toMatchObject({
			cacheTestResults: {
				loadResp: {
					key: "cache_test_testKey",
					value: "test123",
				},
			},
		});

		await expect(makeSocketRequest(client1, "cacheTest")).resolves.toMatchObject({
			cacheTestResults: {
				loadResp: {
					key: "cache_test_testKey",
					value: "test123",
				},
			},
		});

		// only params sent is a JSON block are used
		await expect(
			makeSocketRequest(client1, JSON.stringify({ action: "cacheTest", params: { key: "someOtherKey" } })),
		).rejects.toMatchObject({
			value: "The value field is required.",
		});
	});

	it("will limit how many simultaneous connection a client can have", async () => {
		const response1 = makeSocketRequest(client1, JSON.stringify({ action: "sleep", params: { sleepDuration: 500 } }));
		const response2 = makeSocketRequest(client1, JSON.stringify({ action: "sleep", params: { sleepDuration: 600 } }));
		const response3 = makeSocketRequest(client1, JSON.stringify({ action: "sleep", params: { sleepDuration: 700 } }));
		const response4 = makeSocketRequest(client1, JSON.stringify({ action: "sleep", params: { sleepDuration: 800 } }));
		const response5 = makeSocketRequest(client1, JSON.stringify({ action: "sleep", params: { sleepDuration: 900 } }));
		const response6 = makeSocketRequest(client1, JSON.stringify({ action: "sleep", params: { sleepDuration: 1000 } }));

		const responses = await Promise.allSettled([response1, response2, response3, response4, response5, response6]);

		for (const i in responses) {
			const response = responses[i];

			if (i === "0") {
				const rejectedResponse = response as PromiseRejectedResult;
				expect(rejectedResponse.reason.code).toBe("007");
			} else {
				expect(response.status).toBe("fulfilled");
			}
		}
	});

	describe("with a custom max data length", () => {
		beforeAll(() => {
			api.config.servers.tcp.maxDataLength = 64;
		});

		afterAll(() => {
			api.config.servers.tcp.maxDataLength = 0;
		});

		it("will error if received data length is bigger then maxDataLength", async () => {
			const msg = {
				action: "cacheTest",
				params: {
					key: randomUUID(),
					value: Array(10).fill(randomUUID()).join(""),
				},
			};

			await expect(makeSocketRequest(client1, JSON.stringify(msg))).rejects.toMatchObject({
				code: "008",
				message: "Data length is too big (64 received/451 max)",
			});
		});
	});

	describe("custom data delimiter", function () {
		afterAll(() => {
			// return the config back to normal so we don't error other tests
			api.config.servers.tcp.delimiter = "\n";
		});

		it("will parse /newline data delimiter", async () => {
			await expect(makeSocketRequest(client1, JSON.stringify({ action: "status" }), "\n")).resolves.toMatchObject({
				context: "response",
			});
		});

		it("will parse custom `^]` data delimiter", async () => {
			api.config.servers.tcp.delimiter = "^]";

			await expect(makeSocketRequest(client1, JSON.stringify({ action: "status" }), "^]")).resolves.toMatchObject({
				context: "response",
			});
		});
	});

	describe("chat", function () {
		beforeEach(async () => {
			await makeSocketRequest(client1, "roomJoin defaultRoom");
			await makeSocketRequest(client2, "roomJoin defaultRoom");
			await makeSocketRequest(client3, "roomJoin defaultRoom");
		});

		afterEach(async () => {
			for (const room of ["defaultRoom", "otherRoom"]) {
				await makeSocketRequest(client1, `roomLeave ${room}`);
				await makeSocketRequest(client2, `roomLeave ${room}`);
				await makeSocketRequest(client3, `roomLeave ${room}`);
			}
		});

		it("clients are in the default room", async () => {
			await expect(makeSocketRequest(client1, "roomView defaultRoom")).resolves.toMatchObject({
				data: { room: "defaultRoom" },
			});
		});

		it("clients can view additional info about rooms they are in", async () => {
			await expect(makeSocketRequest(client1, "roomView defaultRoom")).resolves.toMatchObject({
				data: { membersCount: 3 },
			});
		});

		it("rooms can be changed", async () => {
			await makeSocketRequest(client1, "roomJoin otherRoom");

			await expect(makeSocketRequest(client1, "roomLeave defaultRoom")).resolves.toMatchObject({
				status: "OK",
			});

			await expect(makeSocketRequest(client1, "roomView otherRoom")).resolves.toMatchObject({
				data: {
					room: "otherRoom",
				},
			});
		});

		it("connections in the first room see the count go down", async () => {
			await makeSocketRequest(client1, "roomJoin otherRoom");
			await makeSocketRequest(client1, "roomLeave defaultRoom");

			await expect(makeSocketRequest(client2, "roomView defaultRoom")).resolves.toMatchObject({
				data: {
					room: "defaultRoom",
					membersCount: 2,
				},
			});
		});

		describe("middleware", () => {
			const joinFn = spy();
			const leaveFn = spy();

			beforeAll(() => {
				api.chatRoom.addMiddleware({
					name: "join chat middleware",
					join: (connection, room, callback) => {
						joinFn();

						api.chatRoom.emit(room, "message", `I have entered the room: ${connection.id}`).then((_) => {
							callback();
						});
					},
				});

				api.chatRoom.addMiddleware({
					name: "leave chat middleware",
					leave: (connection, room, callback) => {
						leaveFn();

						api.chatRoom.emit(room, "message", `I have left the room: ${connection.id}`).then((_) => {
							callback();
						});
					},
				});
			});

			afterAll(() => {
				api.chatRoom.middleware = {};
				api.chatRoom.globalMiddleware = [];
			});

			it("joining and leaving a run executes the middleware", async () => {
				// join a run an ensure that the middleware is called
				assert(await makeSocketRequest(client1, "roomJoin otherRoom"));
				assertSpyCall(joinFn, 0);

				// consume the join message
				await readSocket(client1);

				// leave a run an ensure that the middleware is called
				await expect(makeSocketRequest(client1, "roomLeave otherRoom")).resolves.toBeTruthy();
				assertSpyCall(leaveFn, 0);
			});
		});
	});

	describe("disconnect", function () {
		let innerClient: Deno.TcpConn;

		beforeAll(async () => {
			innerClient = await Deno.connect({
				port: api.config.servers.tcp.port,
				transport: "tcp",
			});
			await readSocket(innerClient);
		});

		afterAll(() => innerClient.close());

		it("Server can disconnect a client", async () => {
			await expect(makeSocketRequest(innerClient, "status")).resolves.toMatchObject({
				id: "test-server",
			});

			expect(innerClient.readable.locked).toBeFalsy();
			expect(innerClient.writable.locked).toBeFalsy();

			const connection = Object.values(api.connections.connections).find(
				(curConnection: Deno.Conn<Deno.TcpConn>) => curConnection.remotePort === innerClient.localAddr.port,
			);
			connection.destroy();

			await sleep(100);

			await assertRejects(() => readSocket(innerClient), "Connection closed by the server");
		});
	});
});
