import { describe, test } from "@std/testing/bdd";
import { none, option, some } from "./option.ts";
import { expect } from "@std/expect";
import { fail } from "@std/assert";
import { Option } from "./option.types.ts";

describe("Option", () => {
	describe("Factory", () => {
		test("option must create a Some monad with the given value", () => {
			const value = option(4);
			expect(value.isSome()).toBeTruthy();
		});

		test("option must create a None monad when no value is given", () => {
			const value = option();
			expect(value.isNone()).toBeTruthy();
		});

		test("some must create a Some monad", () => {
			const value = some(4);
			expect(value.isSome()).toBeTruthy();
		});

		test("none must create a None monad", () => {
			const value = none();
			expect(value.isNone()).toBeTruthy();
		});
	});

	test("unwrap a Some returns the value", () => {
		const testValue = 1000;
		const value = some(testValue);
		expect(value.unwrap()).toBe(testValue);
	});

	test("unwrap a None panics", () => {
		const value = none<number>();

		try {
			value.unwrap();
			fail("must panic");
		} catch (_) {
			return;
		}
	});

	test("unwrapOr a Some must return the value", () => {
		const testValue: string = "test-value";
		const otherValue: string = "other";

		const value = some(testValue);

		expect(testValue).toBe(value.unwrapOr(otherValue));
	});

	test("unwrapOr a None must return the parameter", () => {
		const otherValue = "other";

		const value = none();

		expect(otherValue).toBe(value.unwrapOr(otherValue));
	});

	test("unwrapOrElse a Some must return the value", () => {
		const testValue: string = "test-value";
		const otherValue: string = "other";

		const value = some(testValue);

		expect(value.unwrapOrElse(() => otherValue)).toBe(testValue);
	});

	test("unwrapOrElse a None must return the other value", () => {
		const otherValue = "other";

		const value = none();

		expect(value.unwrapOrElse(() => otherValue)).toBe(otherValue);
	});

	test("tap Some executes some side-effect function", () => {
		let controlBool = false;
		const testValue = "test-value";

		const value = some(testValue);
		value.tap({
			some(val: string) {
				controlBool = true;

				expect(val).toBe(testValue);
			},
			none() {
				fail("must execute some function");
			},
		});

		!controlBool && fail("must execute some function");
	});

	test("tap None executes none side-effect function", () => {
		let controlBool = false;
		const value = none();

		value.tap({
			some() {
				fail("must execute none function");
			},
			none() {
				controlBool = true;
			},
		});

		!controlBool && fail("must execute none function");
	});

	test("tapNone on Some doesn't execute", () => {
		const value = some("value");

		value.tapNone(() => {
			fail("can be executed when is a Some value");
		});
	});

	test("tapNone on None execute the side-function", () => {
		let control = false;
		const value = none();

		value.tapNone(() => {
			control = true;
		});

		!control && fail("must execute the tapNone function");
	});

	test("tapSome on Some execute the side-effect function", () => {
		let control = false;
		const value = some("value");

		value.tapSome(() => {
			control = true;
		});

		!control && fail("must execute the tapSome function");
	});

	test("tapSome on None do not call the function", () => {
		const value = none();

		value.tapSome(() => {
			fail("must not call the function");
		});
	});

	test("match Some executes some side-effect function", () => {
		let controlBool = false;
		const testValue = "test-value";

		const value = some(testValue);
		value.match({
			some(val: string) {
				controlBool = true;
				expect(val).toBe(testValue);
			},
			none() {
				fail("must execute some function");
			},
		});

		!controlBool && fail("must execute some function");
	});

	test("match None executes none side-effect function", () => {
		const testValue = 1000;
		const value = none();

		const result = value.match<number>({
			some() {
				fail("must execute none function");
			},
			none() {
				return testValue;
			},
		});

		expect(result).toBe(testValue);
	});

	test("map executes when is a Some and return the new value", () => {
		const testValue = 40;
		const testResult = 1000;

		const value = some(testValue);
		const result = value.map((innerVal: number) => {
			expect(innerVal).toBe(testValue);
			return testResult;
		});

		expect(testResult).toBe(result.unwrap());
	});

	test("map do not executes with a None", () => {
		const value = none<number>();
		const result = value.map((_: number) => {
			fail("must not be executed on a None");
		});

		expect(result.isNone()).toBeTruthy();
	});

	test("isSome return true with a Some", () => {
		const value = some(400);
		expect(value.isSome()).toBeTruthy();
	});

	test("isSome return false with a None", () => {
		const value = none();
		expect(value.isNone()).toBeTruthy();
	});

	test("isNone return false with a Some", () => {
		const value = some(1000);
		expect(value.isNone()).toBeFalsy();
	});

	test("isNone return true with a None", () => {
		const value = none();
		expect(value.isNone()).toBeTruthy();
	});

	test("and on Some with None as parameter returns None", () => {
		const x = some(2);
		const y = none<number>();

		expect(x.and(y).isNone()).toBeTruthy();
	});

	test("and on None return None", () => {
		const x = none();
		const y = some("foo");

		expect(x.and(y).isNone()).toBeTruthy();
	});

	test("and on Some return the given Some", () => {
		const resultValue = 1000;

		const value = some(123);
		const result = value.and(some(resultValue));

		expect(result.unwrap()).toBe(resultValue);
	});

	test("and on None given a None return None", () => {
		const x = none();
		const y = none();

		expect(x.and(y).isNone()).toBeTruthy();
	});

	describe("andThen", () => {
		const sq = (x: number) => some(x * x);
		const nope = (_: number) => none<number>();

		test("return None is the option is None", () => {
			expect(some(2).andThen(nope).andThen(sq).isNone()).toBeTruthy();
			expect(some(2).andThen(sq).andThen(nope).isNone()).toBeTruthy();
			expect(none<number>().andThen(sq).andThen(sq).isNone()).toBeTruthy();
		});

		test("call f when is Some", () => {
			expect(some(2).andThen(sq).andThen(sq).unwrap()).toBe(16);
		});
	});

	describe("filter", () => {
		const isEvent = (n: number) => n % 2 === 0;

		test("returns None if the option is None", () => {
			expect(none<number>().filter(isEvent).isNone()).toBeTruthy();
		});

		test("returns Some if the predicate returns true", () => {
			expect(some(2).filter(isEvent).isSome()).toBeTruthy();
		});

		test("returns None if the predicate returns false", () => {
			expect(some(3).filter(isEvent).isNone()).toBeTruthy();
		});
	});

	describe("or", () => {
		test("with Some given None returns the some", () => {
			const x: Option<number> = some(2);
			const y = none<number>();

			expect(x.or(y).unwrap()).toBe(2);
		});

		test("with None given Some returns the given Some", () => {
			const x = none<number>();
			const y = some(100);

			expect(x.or(y).unwrap()).toBe(100);
		});

		test("with Some given Some returns the original Some", () => {
			const x: Option<number> = some(2);
			const y: Option<number> = some(100);

			expect(x.or(y).unwrap()).toBe(2);
		});

		test("with None given Some returns the original Some", () => {
			const x: Option<number> = some(2);
			const y: Option<number> = some(100);

			expect(x.or(y).unwrap()).toBe(2);
		});
	});

	describe("orElse", () => {
		const nobody = () => none<string>();
		const vikings = () => some("vikings") as Option<string>;

		test("with Some returns the original Some", () => {
			const testValue: string = "barbarians";
			expect(some(testValue).orElse(vikings).unwrap()).toBe(testValue);
		});

		test("with None given Some returns the given", () => {
			expect(none().orElse(vikings).unwrap()).toBe("vikings");
		});

		test("with None given None returns None", () => {
			expect(none().orElse(nobody).isNone()).toBeTruthy();
		});
	});

	describe("zip", () => {
		const x = some(1);
		const y = some("hi");
		const z = none<number>();

		test("with Some given None return None", () => {
			expect(x.zip(z).isNone()).toBeTruthy;
		});

		test("with Some given Some return Some with both values", () => {
			const result = x.zip(y);

			expect(result.unwrap()[0]).toBe(x.unwrap());
			expect(result.unwrap()[1]).toBe(y.unwrap());
		});

		test("with None given Some return None", () => {
			expect(z.zip(x).isNone()).toBeTruthy();
		});
	});

	describe("flatten", () => {
		test("with a nested Some returns the nested Some", () => {
			const x = some(some(6));
			expect(x.flatten().unwrap()).toBe(6);
		});

		test("with a nested None returns None", () => {
			const x = some(none<number>());
			expect(x.flatten().isNone()).toBeTruthy();
		});

		test("with None returns None", () => {
			expect(none().flatten().isNone()).toBeTruthy();
		});
	});

	describe("contains", () => {
		test("when is a Some and container the same value returns true", () => {
			expect(some(2).contains(2)).toBeTruthy();
		});

		test("when is a Some and container a different value returns false", () => {
			expect(some<number>(2).contains(3)).toBeFalsy();
		});

		test("when is a None returns false", () => {
			expect(none().contains(2)).toBeFalsy();
		});
	});
});
