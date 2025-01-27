import { afterAll, beforeAll, describe, it } from "vitest";

import Engine from "../../src/engine";
import { expect } from "vitest";
import { API } from "../../src/common/types/api.types.ts";

const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api: API;

describe("Core: Utils", () => {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	describe("for randomStr", () => {
		it("the function must exist and the result be a string", () => {
			expect(api.utils.randomStr).toBeDefined();
			expect(api.utils.randomStr()).toBeTypeOf("string");
		});

		it("when no length given must generate a 16 length string", () => {
			const result = api.utils.randomStr();
			expect(result.length).toBe(16);
		});

		it("when length is given the generated string must have that length", () => {
			const result = api.utils.randomStr(32);
			expect(result.length).toBe(32);
		});
	});
});
