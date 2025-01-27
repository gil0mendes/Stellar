import { afterAll, beforeAll, describe, it } from "vitest";

import Engine from "../../src/engine";
import { expect } from "vitest";
import { runActionPromise } from "../utils";
import { API } from "../../src/common/types/api.types.ts";

const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api: API;

describe("Core: Errors", () => {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	it("returns string errors properly", async function () {
		await expect(runActionPromise(api, "aNotExistingAction")).rejects.toMatchObject({
			code: "004",
		});
	});

	it("returns Error object properly", async function () {
		api.config.errors.unknownAction = () => new Error("error test");

		await expect(runActionPromise(api, "aNotExistingAction")).rejects.toBe("Error: error test");
	});

	it("returns generic object properly", async function () {
		api.config.errors.unknownAction = () => {
			return { code: "error160501" };
		};

		await expect(runActionPromise(api, "aNotExistingAction")).rejects.toMatchObject({
			code: "error160501",
		});
	});
});
