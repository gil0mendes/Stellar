import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

import Engine from "../../src/engine";
import { expect } from "vitest";
import { API } from "../../src/common/types/api.types.ts";

const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api: API;

describe("Core: Event", () => {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	afterEach(async () => {
		await api.events.events.delete("prog");
	});

	it("event methods should exist", () => {
		expect(api.events).toBeTypeOf("object");
		expect(api.events.fire).toBeTypeOf("function");
		expect(api.events.listener).toBeTypeOf("function");
	});

	it("can read events from the listeners folder", () => {
		expect(api.events.events.has("example")).toBeTruthy();
	});

	it("event.listener", () => {
		api.events.listener("prog", (api, params, next) => {});
		expect(api.events.events.has("prog")).toBeTruthy();
	});

	it("event.fire", async () => {
		await expect(api.events.fire("example", { value: "" })).resolves.toMatchObject({
			value: "thisIsATest",
		});
	});

	it("listeners need an event name and a run function", () => {
		expect(api.events._listenerObj({})).toBeFalsy();
		expect(api.events._listenerObj({ event: "example" })).toBeFalsy();
		expect(
			api.events._listenerObj({
				event: "example",
				run: (api, params, next) => {},
			}),
		).toBeTruthy();
	});

	it("listeners can have a priority value", () => {
		api.events.listener(
			"prog",
			(api, params, next) => {
				next();
			},
			200,
		);
		expect(api.events.events.get("prog")[0].priority).toBe(200);
	});

	it("listeners have a default priority", () => {
		api.events.listener("prog", (api, params, next) => {
			next();
		});

		expect(api.events.events.get("prog")[0].priority).toBe(api.config.general.defaultListenerPriority);
	});

	it("listeners are executed in order", async () => {
		api.events.listener(
			"prog",
			(api, params, next) => {
				params.value += "1";
				next();
			},
			10,
		);

		api.events.listener(
			"prog",
			(api, params, next) => {
				params.value += "0";
				next();
			},
			5,
		);

		await expect(api.events.fire("prog", { value: "test" })).resolves.toMatchObject({ value: "test01" });
	});

	it("reads multiple events in the same listener", () => {
		expect(api.events.events.has("multiple")).toBeTruthy();
		expect(api.events.events.has("multiple_two")).toBeTruthy();
	});

	it("can execute a multiply event", async () => {
		await expect(api.events.fire("multiple", { value: "raw" })).resolves.toMatchObject({
			value: "raw_mod",
		});
	});
});
