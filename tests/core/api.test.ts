import { afterAll, beforeAll, describe, it } from "vitest";

import Engine from "../../src/engine";
import { expect } from "vitest";
import { runActionPromise } from "../utils";
import { API } from "../../src/common/types/api.types.ts";

const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api: API;

describe("Core: API", () => {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	it("should have an api object with proper parts", function () {
		[api.actions.actions, api.actions.versions].forEach((item) => expect(item).toBeTypeOf("object"));

		expect(api.config).toBeTypeOf("object");
	});

	describe("api versions", function () {
		beforeAll(() => {
			api.actions.versions.versionedAction = [1, 2, 3];
			api.actions.actions.versionedAction = {
				"1": {
					name: "versionedAction",
					description: "A test action",
					version: 1,
					run: (api, action, next) => {
						action.response.version = 1;
						next();
					},
				},
				"2": {
					name: "versionedAction",
					description: "A test action",
					version: 2,
					run: (api, action, next) => {
						action.response.version = 2;
						next();
					},
				},
				"3": {
					name: "versionedAction",
					description: "A test action",
					version: 3,
					run: (api, action, next) => {
						const complexError = {
							reason: { msg: "description" },
						};
						next(complexError);
					},
				},
			};
		});

		afterAll(() => {
			delete api.actions.actions.versionedAction;
			delete api.actions.versions.versionedAction;
		});

		it("will default actions to version 1 when no version is provided", async () => {
			const response = await runActionPromise(api, "randomNumber");
			expect(response.requesterInformation.receivedParams.apiVersion).toBe(1);
		});

		it("can specify an apiVersion", async () => {
			const response1 = await runActionPromise(api, "versionedAction", {
				apiVersion: 1,
			});
			expect(response1.requesterInformation.receivedParams.apiVersion).toBe(1);

			const response2 = await runActionPromise(api, "versionedAction", {
				apiVersion: 2,
			});
			expect(response2.requesterInformation.receivedParams.apiVersion).toBe(2);
		});

		it("will default clients to the latest version of the action", async () => {
			return expect(
				api.helpers.runAction("versionedAction", {}),
			).resolves.toMatchObject({
				requesterInformation: {
					receivedParams: {
						apiVersion: 3,
					},
				},
			});
		});

		it("will fail on a missing version", () => {
			return expect(runActionPromise(api, "versionedAction", { apiVersion: 16 })).rejects.toHaveProperty("code", "004");
		});

		it("will fail in a missing action", function () {
			return expect(runActionPromise(api, "undefinedAction", {})).rejects.toHaveProperty("code", "004");
		});

		it("can return complex error responses", function () {
			return expect(
				runActionPromise(api, "versionedAction", {
					apiVersion: 3,
				}),
			).rejects.toEqual({
				reason: {
					msg: "description",
				},
			});
		});
	});

	describe("Action Params", function () {
		beforeAll(() => {
			api.actions.versions.testAction = [1];
			api.actions.actions.testAction = {
				"1": {
					name: "testAction",
					description: "this action has some required params",
					version: 1,
					inputs: {
						requiredParam: { required: true },
						optionalParam: { required: false },
						fancyParam: {
							required: false,
							default: "test123",
							validator: function (s) {
								if (s === "test123") {
									return true;
								}
								return `fancyParam should be 'test123'. so says ${this.id}`;
							},
						},
					},

					run: (api, connection, next) => {
						connection.response.params = connection.params;
						next();
					},
				},
			};
		});

		afterAll(() => {
			delete api.actions.versions.testAction;
			delete api.actions.actions.testAction;
		});

		it("correct params that are false or [] should be allowed", async function (done) {
			const response1 = await runActionPromise(api, "testAction", {
				requiredParam: false,
			});
			expect(response1.params.requiredParam).toBe(false);

			const response2 = await runActionPromise(api, "testAction", {
				requiredParam: [],
			});
			expect(response2.params.requiredParam).toEqual([]);
		});

		it("will fail for missing or empty params", async function () {
			await expect(
				runActionPromise(api, "testAction", {
					requiredParam: "",
				}),
			).resolves.not.toHaveProperty("error");

			await expect(runActionPromise(api, "testAction", {})).rejects.toHaveProperty(
				"requiredParam",
				"The requiredParam field is required.",
			);
		});

		it("correct params respect config options", async function () {
			api.config.general.missingParamChecks = [undefined];

			const response = await runActionPromise(api, "testAction", {
				requiredParam: "",
			});
			expect(response.params).toHaveProperty("requiredParam", "");

			const response2 = await runActionPromise(api, "testAction", {
				requiredParam: null,
			});
			expect(response2.params.requiredParam).toBeNull();
		});

		it("will set a default when params are not provided", async function () {
			const response = await runActionPromise(api, "testAction", {
				requiredParam: true,
			});

			expect(response.params).toHaveProperty("fancyParam", "test123");
		});

		it("will use validator if provided", () => {
			return expect(
				runActionPromise(api, "testAction", {
					requiredParam: true,
					fancyParam: 123,
				}),
			).rejects.toHaveProperty("fancyParam", `fancyParam should be 'test123'. so says test-server`);
		});

		it("validator will have the API object in scope and this", async () => {
			return expect(
				runActionPromise(api, "testAction", {
					requiredParam: true,
					fancyParam: 123,
				}),
			).rejects.toEqual({
				fancyParam: "fancyParam should be 'test123'. so says test-server",
			});
		});
	});
});
