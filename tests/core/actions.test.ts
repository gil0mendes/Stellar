import { afterAll, beforeAll, describe, expect, it } from "vitest";

import Engine from "../../src/engine";
import { API } from "../../src/common/types/api.types.ts";
const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api: API;

describe("Core: Actions", () => {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	// ----------------------------------------------------------- [Internal Call]

	describe("can execute internally", () => {
		it("without params", () => {
			return expect(api.actions.call("formattedSum")).rejects.toEqual({
				a: "The a field is required.",
				b: "The b field is required.",
			});
		});

		it("reject works", () => {
			return expect(api.actions.call("formattedSum")).rejects.toThrow();
		});

		it("normally", () => {
			return expect(api.actions.call("formattedSum", { a: 3, b: 3 })).resolves.toEqual({ formatted: "3 + 3 = 6" });
		});
	});

	// ------------------------------------------------------------------ [Groups]

	describe("Groups", () => {
		it("can read the group from an action", () => {
			expect(api.actions.groupsActions.has("example")).toBeTruthy();
		});

		it("the action name exists on the group", () => {
			const arrayOfAction = api.actions.groupsActions.get("example");
			expect(arrayOfAction).toContain("groupTest");
		});

		it("support the group property", () => {
			return expect(api.actions.call("groupTest")).resolves.toEqual({
				result: "OK",
			});
		});

		it("support modules", () => {
			return expect(api.actions.call("modModuleTest")).resolves.toEqual({
				result: "OK",
			});
		});

		it("support the actions property", () => {
			return expect(api.actions.call("modTest")).resolves.toEqual({
				result: "OK",
			});
		});

		it("can add new items to an array", () => {
			return expect(api.actions.call("groupAddItems")).resolves.toHaveProperty("result", ["a", "b", "c"]);
		});

		it("can remove items from the array", async () => {
			const response = await api.actions.call("groupRmItems");
			expect(response.result).toContain("a");
			expect(response.result).not.toContain("b");
		});
	});

	// ------------------------------------------------------------------- [Timeout]

	describe("Timeout", () => {
		// define the timeout to just 100 ms
		beforeAll(() => {
			api.config.general.actionTimeout = 100;
		});

		// reset the actionTimeout to the normal value
		afterAll(() => {
			api.config.general.actionTimeout = 30000;
		});

		it("when the action exceed the config time it timeout", () => {
			return expect(api.actions.call("sleep", { sleepDuration: 150 })).rejects.toEqual({
				code: "022",
				message: `Response timeout for action 'sleep'`,
			});
		});
	});

	// ------------------------------------------------------------------- [Other]

	it("is possible finish an action retuning a promise", () => {
		return expect(api.actions.call("promiseAction")).resolves.toHaveProperty("success", `It's working!`);
	});

	it("is possible using a foreign promise to finish an action", (done) => {
		return expect(api.actions.call("internalCallPromise")).resolves.toHaveProperty("result", `4 + 5 = 9`);
	});

	it("can handle promise rejections and exceptions", (done) => {
		return expect(api.actions.call("errorPromiseAction")).rejects.toHaveProperty("message", "This is an error");
	});

	it("can use a function to set a param default value", async () => {
		return expect(api.actions.call("input-default-function")).resolves.toHaveProperty("value", 156);
	});

	it("can use a function to set a param default value accessing the api object", async () => {
		const testVal = "looks-awesome";
		api.config.testValue = testVal;

		return expect(api.actions.call("inputDefaultFunctionApi")).resolves.toHaveProperty("value", testVal);
	});
});
