import { describe, test } from "@std/testing/bdd";
import { panic } from "./executor.ts";
import { expect } from "@std/expect/expect";
import { fail } from "@std/assert";

describe("runtime", () => {
	test("panic throws an exception", () => {
		try {
			panic("this is an exception");
		} catch (e) {
			if (e instanceof Error) {
				expect(e.message).toBe("this is an exception");
			} else {
				fail("is expected to receive an instance of Error");
			}
		}
	});
});
