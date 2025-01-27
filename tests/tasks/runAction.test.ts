import { afterAll, beforeAll, describe, it } from "vitest";

import Engine from "../../src/engine";
import { expect } from "vitest";
import { API } from "../../src/common/types/api.types.ts";

const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api: API;

describe("Test: RunAction", () => {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	it("can run the task manually", async () => {
		const response = await new Promise((resolve, reject) => {
			api.helpers.runTask(
				"runAction",
				{ action: "randomNumber" },
				(error, response) => !!error ? reject(error) : resolve(response),
			);
		});

		expect(response.number).toBeGreaterThan(0);
		expect(response.number).toBeLessThan(1);
	});
});
