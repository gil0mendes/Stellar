import { afterAll, beforeAll, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";

import axios, { AxiosError } from "axios";

import Engine from "../../src/engine.ts";
import { sleep } from "../../src/utils.ts";
import { API } from "../../src/common/types/api.types.ts";
import { assertEquals } from "@std/assert/equals";
const engine = new Engine({ rootPath: `${Deno.cwd()}/example` });

let api: API;
let url: string = "";

describe("Servers: HTTP", function () {
	beforeAll(async () => {
		api = await engine.start();

		url = `http://localhost:${api.config.servers.web.port}`;
	});

	afterAll(() => engine.stop());

	it("server should be up and return data", async () => {
		const response = await axios.get(`${url}/api/randomNumber`);
		assertEquals(response.status, 200);
	});

	it("server basic response should be JSON and have basic data", async () => {
		try {
			await axios.get(`${url}/api/`);
		} catch (error) {
			if (error instanceof AxiosError) {
				expect(error.response).toBeInstanceOf(Object);
				expect(error.response?.data.requesterInformation).toBeInstanceOf(Object);
			} else throw error;
		}
	});

	it("params work", async () => {
		try {
			await axios.get(`${url}/api?key=value`);
		} catch (error) {
			if (error instanceof AxiosError) {
				await expect(error.response?.data).toMatchObject({
					requesterInformation: {
						receivedParams: {
							key: "value",
						},
					},
				});
			} else throw error;
		}
	});

	it("can not call private actions", async () => {
		try {
			await axios.get(`${url}/api/sumANumber?a=3&b=4`);
		} catch (error) {
			if (error instanceof AxiosError) {
				await expect(error.response?.data).toMatchObject({
					error: {
						code: "002",
					},
				});
			} else throw error;
		}
	});

	it("can call actions who call private actions", async () => {
		const response = await axios.get(`${url}/api/formattedSum?a=3&b=4`);

		await expect(response.data).toMatchObject({
			formatted: "3 + 4 = 7",
		});
	});

	it("can execute namespaced actions", async () => {
		const response = await axios.get(`${url}/api/isolated.action`);

		await expect(response.data).toMatchObject({
			success: "ok",
		});
	});

	it("will generate an error call an action with an invalid type", async () => {
		try {
			await axios.get(`${url}/api/formattedSum?a=3&b=thisIsInvalid`);
		} catch (error) {
			if (error instanceof AxiosError) {
				await expect(error.response?.data).toMatchObject({
					error: {
						b: {
							code: "003",
						},
					},
				});
			} else throw error;
		}
	});

	describe("will properly destroy connections", function () {
		it("works for the API", async () => {
			expect(Object.keys(api.connections.connections).length).toBe(0);

			const requestPromise = axios.get(`${url}/api/sleep`);
			await sleep(100);
			expect(Object.keys(api.connections.connections)).toHaveLength(1);

			await requestPromise;
			expect(Object.keys(api.connections.connections)).toHaveLength(0);
		});

		// TODO: test for files
	});

	describe("errors", function () {
		beforeAll(() => {
			api.actions.versions.stringErrorTestAction = [1];
			api.actions.actions.stringErrorTestAction = {
				1: {
					name: "stringErrorTestAction",
					description: "stringErrorTestAction",
					version: 1,
					run(api, data) {
						throw "broken";
					},
				},
			};

			api.actions.versions.errorErrorTestAction = [1];
			api.actions.actions.errorErrorTestAction = {
				1: {
					name: "errorErrorTestAction",
					description: "errorErrorTestAction",
					version: 1,
					run(api, data) {
						throw new Error("broken");
					},
				},
			};

			api.actions.versions.complexErrorTestAction = [1];
			api.actions.actions.complexErrorTestAction = {
				1: {
					name: "complexErrorTestAction",
					description: "complexErrorTestAction",
					version: 1,
					run(api, data) {
						throw ({ error: "broken", reason: "stuff" });
					},
				},
			};

			api.routes.loadRoutes();
		});

		afterAll(() => {
			delete api.actions.actions.stringErrorTestAction;
			delete api.actions.versions.stringErrorTestAction;
			delete api.actions.actions.errorErrorTestAction;
			delete api.actions.versions.errorErrorTestAction;
			delete api.actions.actions.complexErrorTestAction;
			delete api.actions.versions.complexErrorTestAction;
		});

		it("errors can be error strings", async () => {
			try {
				await axios.get(`${url}/api/stringErrorTestAction`);
			} catch (error) {
				if (error instanceof AxiosError) {
					expect(error.response?.data).toMatchObject({
						error: "broken",
					});
				} else throw error;
			}
		});

		it("errors can be objects and returned plainly", async () => {
			try {
				await axios.get(`${url}/api/errorErrorTestAction`);
			} catch (error) {
				if (error instanceof AxiosError) {
					expect(error.response?.data).toMatchObject({
						error: "broken",
					});
				} else throw error;
			}
		});

		it("errors can be complex JSON payloads", async () => {
			try {
				await axios.get(`${url}/api/complexErrorTestAction`);
			} catch (error) {
				if (error instanceof AxiosError) {
					expect(error.response?.data).toMatchObject({
						error: {
							error: "broken",
							reason: "stuff",
						},
					});
				} else throw error;
			}
		});
	});

	it("not existing actions have the right response", async () => {
		try {
			await axios.get(`${url}/api/someNotExistingAction`);
		} catch (error) {
			if (error instanceof AxiosError) {
				expect(error.response?.data).toMatchObject({
					error: {
						code: "004",
					},
				});
			} else throw error;
		}
	});

	it("real actions do not have an error response", async () => {
		const response = await axios.get(`${url}/api/status`);

		expect(response.data.error).toBeUndefined();
	});

	it("HTTP Verbs should work: GET", async () => {
		const response = await axios.get(`${url}/api/randomNumber`);

		expect(response.data.number).toBeGreaterThanOrEqual(0);
		expect(response.data.number).toBeLessThanOrEqual(10);
	});

	it("HTTP Verbs should work: POST", async () => {
		const response = await axios.post(`${url}/api/randomNumber`);

		expect(response.data.number).toBeGreaterThanOrEqual(0);
		expect(response.data.number).toBeLessThanOrEqual(10);
	});

	it("HTTP Verbs should work: PUT", async () => {
		const response = await axios.put(`${url}/api/randomNumber`);

		expect(response.data.number).toBeGreaterThanOrEqual(0);
		expect(response.data.number).toBeLessThanOrEqual(10);
	});

	it("HTTP Verbs should work: DELETE", async () => {
		const response = await axios.delete(`${url}/api/randomNumber`);

		expect(response.data.number).toBeGreaterThanOrEqual(0);
		expect(response.data.number).toBeLessThanOrEqual(10);
	});

	it("HTTP Verbs should work: POST with Form", async () => {
		const data = new FormData();
		data.append("key", "key");
		data.append("value", "value");
		const response = await axios.post(`${url}/api/cacheTest`, data);

		expect(response.data).toMatchObject({
			cacheTestResults: {
				saveResp: true,
			},
		});
	});

	it("HTTP Verbs should work: POST with JSON Payload as body", async () => {
		const response = await axios.post(`${url}/api/cacheTest`, {
			key: "key",
			value: "value",
		});

		expect(response.data).toMatchObject({
			cacheTestResults: {
				saveResp: true,
			},
		});
	});

	describe("connection.rawConnection.params", function () {
		beforeAll(() => {
			api.actions.versions.paramTestAction = [1];
			api.actions.actions.paramTestAction = {
				1: {
					name: "paramTestAction",
					description: "Returns connection.rawConnection.params",
					version: 1,
					run(api, action) {
						return action.connection.rawConnection.params;
					},
				},
			};

			api.routes.loadRoutes();
		});

		afterAll(() => {
			delete api.actions.actions.paramTestAction;
			delete api.actions.versions.paramTestAction;
		});

		it(".query should contain unfiltered query params", async () => {
			const response = await axios.get(`${url}/api/paramTestAction?awesomeParam=something`);

			await expect(response.data).toMatchObject({
				query: {
					awesomeParam: "something",
				},
			});
		});

		it(".body should contain unfiltered request body params", async () => {
			const response = await axios.post(`${url}/api/paramTestAction`, {
				key: "value",
			});

			await expect(response.data).toMatchObject({
				body: {
					key: "value",
				},
			});
		});
	});

	describe("with error codes disabled", () => {
		beforeAll(() => {
			api.config.servers.web.returnErrorCodes = false;
		});

		afterAll(() => {
			api.config.servers.web.returnErrorCodes = true;
		});

		it("returnErrorCodes false should still have a status of 200", async () => {
			const response = await axios.delete(`${url}/api`);

			expect(response.status).toBe(200);
		});
	});

	it("returnErrorCodes can be opted to change HTTP header codes", async () => {
		try {
			await axios.delete(`${url}/api`);
		} catch (error) {
			if (error instanceof AxiosError) {
				expect(error.response?.status).toEqual(404);
			} else throw error;
		}
	});

	describe("HTTP header", function () {
		beforeAll(() => {
			// enable HTTP status codes
			api.config.servers.web.returnErrorCodes = true;

			// add a test action
			api.actions.versions.headerTestAction = [1];
			api.actions.actions.headerTestAction = {
				1: {
					name: "headerTestAction",
					description: "Test action",
					version: 1,
					run(api, action) {
						action.connection.rawConnection.response.headers.set("thing", "A");
						action.connection.rawConnection.response.headers.set("thing", "B");
						action.connection.rawConnection.response.headers.set("thing", "C");
						action.connection.rawConnection.response.headers.set("Set-Cookie", "value_1=1");
						action.connection.rawConnection.response.headers.set("Set-Cookie", "value_2=2");
					},
				},
			};

			api.routes.loadRoutes();
		});

		afterAll(() => {
			delete api.actions.versions.headerTestAction;
			delete api.actions.actions.headerTestAction;
		});

		it("duplicated headers should be removed (in favor of the last set)", async () => {
			const response = await axios.get(`${url}/api/headerTestAction`);

			expect(response.status).toBe(200);
			expect(response.headers.get("thing")).toBe("C");
		});

		it("should respond to OPTIONS with only HTTP headers", async () => {
			const response = await fetch(`${url}/api/cacheTest`, {
				method: "OPTIONS",
			});

			// close stream
			await response.body?.cancel();

			expect(response.status).toBe(200);
			expect(response.headers.get("access-control-allow-methods")).toBe(
				"HEAD, GET, POST, PUT, PATCH, DELETE, OPTIONS, TRACE",
			);
			expect(response.headers.get("access-control-allow-origin")).toBe("*");
		});

		it("should respond to HEAD request just like GET, but with no body", async () => {
			const response = await axios.head(`${url}/api/headerTestAction`);

			expect(response.status).toBe(200);
			expect(response.data).toEqual("");
		});

		// it("keeps sessions with browser_fingerprint", async () => {
		//   let jar = new CookieJar();
		//   const client = wrapper(axios.create({ jar }));

		//   const response1 = await client.post(url + "/api");
		//   const response2 = await client.get(url + "/api");
		//   const response3 = await client.put(url + "/api");
		//   const response4 = await client.delete(url + "/api");
		//   const response5 = await axios.delete(url + "/api");

		//   expect(response1.headers["set-cookie"]).toBeTruthy();
		//   expect(response2.headers["set-cookie"]).toBeUndefined();
		//   expect(response3.headers["set-cookie"]).toBeUndefined();
		//   expect(response4.headers["set-cookie"]).toBeUndefined();
		//   expect(response5.headers["set-cookie"]).toBeTruthy();

		//   const fingerprint1 = response1.data.requesterInformation.id.split("-")[0];
		//   const fingerprint2 = response2.data.requesterInformation.id.split("-")[0];
		//   const fingerprint3 = response3.data.requesterInformation.id.split("-")[0];
		//   const fingerprint4 = response4.data.requesterInformation.id.split("-")[0];
		//   const fingerprint5 = response5.data.requesterInformation.id.split("-")[0];

		//   expect(fingerprint1).toEqual(fingerprint2);
		//   expect(fingerprint1).toEqual(fingerprint3);
		//   expect(fingerprint1).toEqual(fingerprint4);
		//   expect(fingerprint1).not.toEqual(fingerprint5);

		//   expect(fingerprint1).toEqual(
		//     response1.data.requesterInformation.fingerprint
		//   );
		//   expect(fingerprint2).toEqual(
		//     response2.data.requesterInformation.fingerprint
		//   );
		//   expect(fingerprint3).toEqual(
		//     response3.data.requesterInformation.fingerprint
		//   );
		//   expect(fingerprint4).toEqual(
		//     response4.data.requesterInformation.fingerprint
		//   );
		//   expect(fingerprint5).toEqual(
		//     response5.data.requesterInformation.fingerprint
		//   );
		// });
	});
});
