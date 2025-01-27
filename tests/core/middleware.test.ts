import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import Engine from "../../src/engine";
import { runActionPromise } from "../utils";
import { API } from "../../src/common/types/api.types.ts";

const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api: API;

describe("Core: Middleware", function () {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	// reset list of middleware after each test case
	afterEach(function () {
		api.actions.middleware = {};
		api.actions.globalMiddleware = [];
	});

	describe("action preProcessors", function () {
		it("I can define a global preProcessor and it can append the connection", async function () {
			api.actions.addMiddleware({
				name: "test middleware",
				global: true,
				preProcessor: (data, next) => {
					data.response._preProcessorNote = "note";
					next();
				},
			});

			await expect(runActionPromise(api, "randomNumber")).resolves.toMatchObject({
				_preProcessorNote: "note",
			});
		});

		it("I can define a local preProcessor and it will not append the connection", async function () {
			api.actions.addMiddleware({
				name: "test middleware",
				global: false,
				preProcessor: (data, next) => {
					data.response._preProcessorNote = "note";
					next();
				},
			});

			const response = await runActionPromise(api, "randomNumber");
			expect(response._preProcessorNote).toBeUndefined();
		});

		it("preProcessors with priority run in the right order", async function () {
			// first priority
			api.actions.addMiddleware({
				name: "first test middleware",
				global: true,
				priority: 1,
				preProcessor: (data, next) => {
					data.response._preProcessorNote1 = "first";
					data.response._preProcessorNote2 = "first";
					data.response._preProcessorNote3 = "first";
					data.response._preProcessorNote4 = "first";
					next();
				},
			});

			// lower number priority (runs sooner)
			api.actions.addMiddleware({
				name: "early test middleware",
				global: true,
				priority: api.config.general.defaultMiddlewarePriority - 1,
				preProcessor: (data, next) => {
					data.response._preProcessorNote2 = "early";
					data.response._preProcessorNote3 = "early";
					data.response._preProcessorNote4 = "early";
					next();
				},
			});

			// default priority
			api.actions.addMiddleware({
				name: "default test middleware",
				global: true,
				preProcessor: (data, next) => {
					data.response._preProcessorNote3 = "default";
					data.response._preProcessorNote4 = "default";
					next();
				},
			});

			// higher number priority (runs later)
			api.actions.addMiddleware({
				name: "late test middleware",
				global: true,
				priority: api.config.general.defaultMiddlewarePriority + 1,
				preProcessor: (data, next) => {
					data.response._preProcessorNote4 = "late";
					next();
				},
			});

			await expect(runActionPromise(api, "randomNumber")).resolves.toMatchObject({
				_preProcessorNote1: "first",
				_preProcessorNote2: "early",
				_preProcessorNote3: "default",
				_preProcessorNote4: "late",
			});
		});

		it("multiple preProcessors with same priority are executed", async function () {
			api.actions.addMiddleware({
				name: "first test middleware",
				global: true,
				priority: api.config.general.defaultMiddlewarePriority - 1,
				preProcessor: (data, next) => {
					data.response._processorNoteFrist = "first";
					next();
				},
			});

			api.actions.addMiddleware({
				name: "second test middleware",
				global: true,
				priority: api.config.general.defaultMiddlewarePriority - 1,
				preProcessor: (data, next) => {
					data.response._processorNoteSecond = "second";
					next();
				},
			});

			await expect(runActionPromise(api, "randomNumber")).resolves.toMatchObject({
				_processorNoteFrist: "first",
				_processorNoteSecond: "second",
			});
		});

		it("postProcessors can append the connection", async function () {
			api.actions.addMiddleware({
				name: "test middleware",
				global: true,
				postProcessor: (data, next) => {
					data.response._postProcessorNote = "note";
					next();
				},
			});

			expect(runActionPromise(api, "randomNumber")).resolves.toMatchObject({
				_postProcessorNote: "note",
			});
		});

		it("postProcessors with priority run in the right order", async function () {
			// first priority
			api.actions.addMiddleware({
				name: "first test middleware",
				global: true,
				priority: 1,
				postProcessor: (data, next) => {
					data.response._postProcessorNote1 = "first";
					data.response._postProcessorNote2 = "first";
					data.response._postProcessorNote3 = "first";
					data.response._postProcessorNote4 = "first";
					next();
				},
			});

			// lower number priority (runs sooner)
			api.actions.addMiddleware({
				name: "early test middleware",
				global: true,
				priority: api.config.general.defaultMiddlewarePriority - 1,
				postProcessor: (data, next) => {
					data.response._postProcessorNote2 = "early";
					data.response._postProcessorNote3 = "early";
					data.response._postProcessorNote4 = "early";
					next();
				},
			});

			// default priority
			api.actions.addMiddleware({
				name: "default test middleware",
				global: true,
				postProcessor: (data, next) => {
					data.response._postProcessorNote3 = "default";
					data.response._postProcessorNote4 = "default";
					next();
				},
			});

			// higher number priority (runs later)
			api.actions.addMiddleware({
				name: "late test middleware",
				global: true,
				priority: api.config.general.defaultMiddlewarePriority + 1,
				postProcessor: (data, next) => {
					data.response._postProcessorNote4 = "late";
					next();
				},
			});

			await expect(runActionPromise(api, "randomNumber")).resolves.toMatchObject({
				_postProcessorNote1: "first",
				_postProcessorNote2: "early",
				_postProcessorNote3: "default",
				_postProcessorNote4: "late",
			});
		});

		it("multiple postProcessors with same priority are executed", async function () {
			api.actions.addMiddleware({
				name: "first test middleware",
				global: true,
				priority: api.config.general.defaultMiddlewarePriority - 1,
				postProcessor: (data, next) => {
					data.response._processorNoteFrist = "first";
					next();
				},
			});

			api.actions.addMiddleware({
				name: "second test middleware",
				global: true,
				priority: api.config.general.defaultMiddlewarePriority - 1,
				postProcessor: (data, next) => {
					data.response._processorNoteSecond = "second";
					next();
				},
			});

			await expect(runActionPromise(api, "randomNumber")).resolves.toMatchObject({
				_processorNoteFrist: "first",
				_processorNoteSecond: "second",
			});
		});

		it("preProcessors can block actions", async function () {
			api.actions.addMiddleware({
				name: "test middleware",
				global: true,
				preProcessor: (data, next) => {
					next(new Error("BLOCKED"));
				},
			});

			await expect(runActionPromise(api, "randomNumber")).rejects.toThrowError("Error: BLOCKED");
		});

		it("postProcessors can modify toRender", async function () {
			api.actions.addMiddleware({
				name: "test middleware",
				global: true,
				postProcessor: (data, next) => {
					data.toRender = false;
					next();
				},
			});

			return new Promise((resolve) => {
				let isResolved = false;

				runActionPromise(api, "randomNumber").then(() => {
					isResolved = true;
				});

				setTimeout(() => {
					!isResolved && resolve(true);
				}, 400);
			});
		});
	});

	describe("connection create/destroy callbacks", function () {
		beforeEach(function () {
			api.connections.middleware = {};
			api.connections.globalMiddleware = [];
		});

		afterEach(function () {
			api.connections.middleware = {};
			api.connections.globalMiddleware = [];
		});

		it("can create callbacks on connection creation", async function () {
			const promiseToTest = new Promise((resolve) => {
				api.connections.addMiddleware({
					name: "connection middleware",
					create: () => {
						resolve(true);
					},
				});
			});

			await api.helpers.runAction("randomNumber");

			await expect(promiseToTest).resolves.toBeTruthy();
		});

		it("can create callbacks on connection destroy", async function () {
			const promiseToTest = new Promise((resolve) => {
				api.connections.addMiddleware({
					name: "connection middleware",
					destroy: () => {
						resolve(true);
					},
				});
			});

			await api.helpers.runAction("randomNumber");
			connection.destroy();

			await expect(promiseToTest).resolves.toBeTruthy();
		});
	});
});
