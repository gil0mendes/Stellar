import { afterAll, beforeAll, describe, expect, it } from "vitest";

import Engine from "../../src/engine";

const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api = null;

const simplesValidator = (name, value) => api.validator.validate({ key: value }, { key: name });

describe("Core: Validators", function () {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	it("alpha", () => {
		expect(simplesValidator("alpha", "alpha")).toBeTruthy();

		expect(simplesValidator("alpha", "alpha123").get("key")).toBe("The key must only contain letters.");
	});

	it("alpha_num", () => {
		expect(simplesValidator("alpha_num", "alpha")).toBeTruthy();
		expect(simplesValidator("alpha_num", "alpha123")).toBeTruthy();

		expect(simplesValidator("alpha_num", "alpha %").get("key")).toBe("The key may only contain letters and numbers.");
	});

	it("alpha_dash", () => {
		expect(simplesValidator("alpha_dash", "alpha")).toBeTruthy();
		expect(simplesValidator("alpha_dash", "alpha123")).toBeTruthy();
		expect(simplesValidator("alpha_dash", "al-ph_a")).toBeTruthy();

		expect(simplesValidator("alpha_dash", "alpha12-3_ ").get("key")).toBe(
			"The key may only contain letters, numbers, and dashes.",
		);
	});

	it("array", () => {
		expect(simplesValidator("array", [1, 2, 3])).toBeTruthy();

		expect(simplesValidator("array", { a: 1, b: 2 }).get("key")).toBe("The key must be an array.");
		expect(simplesValidator("array", "asd").get("key")).toBe("The key must be an array.");
	});

	it("before", () => {
		expect(() => {
			simplesValidator("before:2016--28", "");
		}).toThrowError("the specified argument is not a valid date");

		expect(simplesValidator("before:2016-05-28", "asd").get("key")).toBe("The key must be a date before 2016-05-28.");
		expect(simplesValidator("before:2016-05-28", "2016-05-12")).toBeTruthy();
		expect(simplesValidator("before:2016-05-28", "2016-07-18")).not.be.equal(true);
	});

	it("after", () => {
		expect(simplesValidator("after:2016-11-26", "asd").get("key")).toBe("The key must be a date after 2016-11-26.");
		expect(simplesValidator("after:2016-11-26", "2016-11-25")).not.be.equal(true);
		expect(simplesValidator("after:2016-11-26", "2016-11-26")).not.be.equal(true);
		expect(simplesValidator("after:2016-11-26", "2016-11-27")).toBeTruthy();
	});

	it("between", () => {
		expect(() => simplesValidator("between", "")).toThrow();
		expect(simplesValidator("between:20,50", "asd").get("key")).toBe("The key must be between 20 and 50 characters.");
		expect(simplesValidator("between:1,3", "23")).toBeTruthy();
		expect(simplesValidator("between:5,50", 200).get("key")).toBe("The key must be between 5 and 50 characters.");
		expect(simplesValidator("between:0,10", 6)).toBeTruthy();
		expect(simplesValidator("between:0,20", [1, 2, 4]).get("key")).toBe("The key must be between 0 and 20 characters.");
	});

	it("boolean", () => {
		expect(simplesValidator("boolean", true)).toBeTruthy();
		expect(simplesValidator("boolean", false)).toBeTruthy();
		expect(simplesValidator("boolean", "asd").get("key")).toBe("The key field must be true or false.");
		expect(simplesValidator("boolean", 123).get("key")).toBe("The key field must be true or false.");
		expect(simplesValidator("boolean", [1, 2]).get("key")).toBe("The key field must be true or false.");
		expect(simplesValidator("boolean", { key: "value" }).get("key")).toBe("The key field must be true or false.");
	});

	it("confirmed", () => {
		expect(api.validator.validate({ key: "value", key_confirmation: "value" }, { key: "confirmed" })).toBeTruthy();
		expect(api.validator.validate({ key: "value" }, { key: "confirmed" }).get("key")).toBe(
			"The key confirmation does not match.",
		);
		expect(
			api.validator
				.validate(
					{
						key: "value",
						key_confirmation: "other_value",
					},
					{ key: "confirmed" },
				)
				.get("key"),
		).toBe("The key confirmation does not match.");
	});

	it("date", () => {
		expect(simplesValidator("date", "")).be.not.equal(true);
		expect(simplesValidator("date", "2016-05-28")).toBeTruthy();
	});

	it("different", () => {
		expect(() => {
			api.validator.validate({ key: "value", key2: "value2" }, { key: "different" });
		}).toThrow();
		expect(api.validator.validate({ key: "value", key2: "value" }, { key: "different:key2" }).get("key")).toBe(
			"The key and key2 must be different.",
		);
		expect(api.validator.validate({ key: "value", key2: "value2" }, { key: "different:key2" })).toBeTruthy();
	});

	it("email", () => {
		expect(simplesValidator("email", "").get("key")).toBe("The key must be a valid email address.");
		expect(simplesValidator("email", "user").get("key")).toBe("The key must be a valid email address.");
		expect(simplesValidator("email", "example.com").get("key")).toBe("The key must be a valid email address.");
		expect(simplesValidator("email", "user@example").get("key")).toBe("The key must be a valid email address.");
		expect(simplesValidator("email", "user@example.com")).toBeTruthy();
		expect(simplesValidator("email", "user.surname@example.com")).be.equal(true);
	});

	it("filled", () => {
		expect(simplesValidator("filled", null).get("key")).toBe("The key field is required.");
		expect(simplesValidator("filled", "").get("key")).toBe("The key field is required.");
		expect(simplesValidator("filled", "value")).toBeTruthy();
	});

	it("in", () => {
		expect(() => {
			simplesValidator("in", "1");
		}).toThrowError("validator needs an array");
		expect(simplesValidator("in:1,2,3", "1")).toBeTruthy();
		expect(simplesValidator("in:1,2,3", "7").get("key")).toBe("The selected key is invalid.");
	});

	it("not_in", () => {
		expect(() => {
			simplesValidator("not_in", "1");
		}).toThrowError("validator needs an array");
		expect(simplesValidator("not_in:1,2,3", "1").get("key")).toBe("The selected key is invalid.");
		expect(simplesValidator("not_in:1,2,3", "7")).toBeTruthy();
	});

	it("integer", () => {
		expect(simplesValidator("integer", "asd").get("key")).toEqual("The key must be an integer.");
		expect(simplesValidator("integer", "123")).toBeTruthy();
		expect(simplesValidator("integer", 123)).toBeTruthy();
	});

	it("ip", () => {
		expect(simplesValidator("ip", "127.0.0.1")).toBeTruthy();
		expect(simplesValidator("ip", "").get("key")).toBe("The key must be a valid IP address.");
	});

	it("json", () => {
		expect(simplesValidator("json", "").get("key")).toBe("The key must be a valid JSON string.");
		expect(simplesValidator("json", "string").get("key")).toBe("The key must be a valid JSON string.");
		expect(simplesValidator("json", "123").get("key")).toBe("The key must be a valid JSON string.");
		expect(simplesValidator("json", 123).get("key")).toBe("The key must be a valid JSON string.");
		expect(simplesValidator("json", JSON.stringify({ key: "test", value: 123 }))).toBeTruthy();
	});

	it("max", () => {
		expect(() => {
			simplesValidator("max", "");
		}).toThrowError("Validation rule max requires at least 1 parameters.");
		expect(simplesValidator("numeric|max:10", 9)).toBeTruthy();
		expect(simplesValidator("numeric|max:10", 10)).toBeTruthy();
		expect(simplesValidator("numeric|max:10", 11).get("key")).toBe("The key may not be greater than 10.");
		expect(simplesValidator("max:3", "as")).toBeTruthy();
		expect(simplesValidator("max:3", "asd")).toBeTruthy();
		expect(simplesValidator("max:3", "asdf").get("key")).toBe("The key may not be greater than 3 characters.");
		expect(simplesValidator("array|max:3", [1, 2])).toBeTruthy();
		expect(simplesValidator("array|max:3", [1, 2, 3])).toBeTruthy();
		expect(simplesValidator("array|max:3", [1, 2, 3, 4]).get("key")).toBe("The key may not have more than 3 items.");
	});

	it("min", () => {
		expect(() => {
			simplesValidator("min", "");
		}).toThrowError("Validation rule min requires at least 1 parameters.");
		expect(simplesValidator("numeric|min:3", 2).get("key")).toBe("The key must be at least 3.");
		expect(simplesValidator("numeric|min:3", 3)).toBeTruthy();
		expect(simplesValidator("numeric|min:3", 4)).toBeTruthy();
		expect(simplesValidator("min:3", "as").get("key")).toBe("The key must be at least 3 characters.");
		expect(simplesValidator("min:3", "asd")).toBeTruthy();
		expect(simplesValidator("min:3", "asdf")).toBeTruthy();
		expect(simplesValidator("array|min:3", [1, 2]).get("key")).toBe("The key must have at least 3 items.");
		expect(simplesValidator("array|min:3", [1, 2, 3])).toBeTruthy();
		expect(simplesValidator("array|min:3", [1, 2, 3, 4])).toBeTruthy();
	});

	it("required", () => {
		expect(api.validator.validate({}, { key: "required" }).get("key")).toBe("The key field is required.");
		expect(simplesValidator("required", "someValue")).toBeTruthy();
	});

	it("numeric", () => {
		expect(simplesValidator("numeric", "asd").get("key")).toBe("The key must be a number.");
		expect(simplesValidator("numeric", 123)).toBeTruthy();
		expect(simplesValidator("numeric", 123.123)).toBeTruthy();
	});

	it("regex", () => {
		expect(() => {
			simplesValidator("regex", "asd");
		}).toThrowError("Validation rule regex requires at least 1 parameters.");

		expect(simplesValidator("regex:^\\d{3}$", "asd").get("key")).toBe("The key format is invalid.");

		expect(simplesValidator("regex:^\\d{3}$", "123")).toBeTruthy();
	});

	it("required_if", () => {
		expect(() => {
			api.validator.validate(
				{
					key: "v1",
					key2: "v2",
				},
				{ key: "required_if" },
			);
		}).toThrowError("Validation rule required_if requires at least 2 parameters.");
		expect(api.validator.validate({ key2: "b" }, { key: "required_if:key2,v,v1,v2" })).toBeTruthy();
		expect(api.validator.validate({ key2: "v1" }, { key: "required_if:key2,v,v1,v2" }).get("key")).toBe(
			"The key field is required when key2 is in v, v1, v2.",
		);
		expect(api.validator.validate({ key: "v1", key2: "v2" }, { key: "required_if:key2,v1" })).toBeTruthy();
	});

	it("required_unless", () => {
		expect(() => {
			api.validator.validate({ key: "" }, { key: "required_unless" });
		}).toThrowError("Validation rule required_unless requires at least 2 parameters.");
		expect(api.validator.validate({ key: "" }, { key: "required_unless:key2,val1,val2" }).get("key")).toBe(
			"The key field is required unless key2 is in val1, val2.",
		);
		expect(
			api.validator
				.validate(
					{
						key: "",
						key2: "otherValue",
					},
					{ key: "required_unless:key2,val1,val2" },
				)
				.get("key"),
		).toBe("The key field is required unless key2 is in val1, val2.");
		expect(api.validator.validate({ key: "notEmpty" }, { key: "required_unless:key2,val1,val2" })).toBeTruthy();
		expect(api.validator.validate({ key: "", key2: "val1" }, { key: "required_unless:key2,val1,val2" })).toBeTruthy();
	});

	it("required_with", () => {
		expect(() => {
			api.validator.validate({ key: "" }, { key: "required_with" });
		}).toThrowError("Validation rule required_with requires at least 1 parameters.");
		expect(api.validator.validate({ key: "" }, { key: "required_with:name,surname" })).toBeTruthy();
		expect(
			api.validator
				.validate(
					{
						key: "",
						name: "Alec",
					},
					{
						key: "required_with:name,surname",
					},
				)
				.get("key"),
		).toBe("The key field is required when at least one of name, surname is present.");
		expect(
			api.validator.validate(
				{
					key: "someValue",
					name: "Alec",
				},
				{ key: "required_with:name,surname" },
			),
		).toBeTruthy();
	});

	it("required_with_all", () => {
		expect(() => {
			api.validator.validate({ key: "" }, { key: "required_with_all" });
		}).toThrowError("Validation rule required_with_all requires at least 2 parameters.");
		expect(api.validator.validate({ key: "" }, { key: "required_with_all:name,surname" })).toBeTruthy();
		expect(
			api.validator.validate(
				{
					key: "",
					name: "Alec",
				},
				{ key: "required_with_all:name,surname" },
			),
		).toBeTruthy();
		expect(
			api.validator
				.validate(
					{
						key: "",
						name: "Alec",
						surname: "Sadler",
					},
					{ key: "required_with_all:name,surname" },
				)
				.get("key"),
		).toBe("The key field is required when name, surname are present.");
		expect(
			api.validator.validate(
				{
					key: "someValue",
					name: "Alec",
					surname: "Sadler",
				},
				{ key: "required_with_all:name,surname" },
			),
		).toBeTruthy();
		expect(api.validator.validate({ key: "someValue" }, { key: "required_with_all:name,surname" })).toBeTruthy();
	});

	it("required_without", () => {
		expect(() => {
			api.validator.validate({ key: "" }, { key: "required_without" });
		}).toThrowError("Validation rule required_without requires at least 1 parameters.");

		expect(api.validator.validate({ key: "" }, { key: "required_without:name,surname" }).get("key")).toBe(
			"The key field is required when at least one of name, surname is not present.",
		);

		expect(api.validator.validate({ key: "", name: "Alec" }, { key: "required_without:name,surname" }).get("key")).toBe(
			"The key field is required when at least one of name, surname is not present.",
		);

		expect(
			api.validator.validate({ key: "someValue", name: "Alec" }, { key: "required_without:name,surname" }),
		).toBeTruthy();

		expect(
			api.validator.validate(
				{
					key: "someValue",
					name: "Alec",
					surname: "Sadler",
				},
				{ key: "required_without:name,surname" },
			),
		).toBeTruthy();
	});

	it("required_without_all", () => {
		expect(() => {
			api.validator.validate({ key: "" }, { key: "required_without_all" });
		}).toThrowError("Validation rule required_without_all requires at least 2 parameters.");

		expect(api.validator.validate({ key: "" }, { key: "required_without_all:name,surname" }).get("key")).toBe(
			"The key field is required when none of name, surname are present.",
		);

		expect(
			api.validator.validate({ key: "", name: "Alec" }, { key: "required_without_all:name,surname" }),
		).toBeTruthy();

		expect(
			api.validator.validate(
				{
					key: "",
					name: "Alec",
					surname: "Sadler",
				},
				{ key: "required_without_all:name,surname" },
			),
		).toBeTruthy();

		expect(
			api.validator.validate(
				{
					key: "someValue",
					name: "Alec",
					surname: "Sadler",
				},
				{ key: "required_without_all:name,surname" },
			),
		).toBeTruthy();
		expect(api.validator.validate({ key: "someValue" }, { key: "required_without_all:name,surname" })).toBeTruthy();
	});

	it("same", () => {
		expect(() => {
			api.validator.validate({ key: "" }, { key: "same" });
		}).toThrowError("Validation rule same requires at least 1 parameters.");

		expect(api.validator.validate({ pass: "test", opass: "test" }, { pass: "same:opass" })).toBeTruthy();

		expect(api.validator.validate({ pass: "test", opass: "test__" }, { pass: "same:opass" }).get("pass")).toBe(
			"The pass and opass must match.",
		);
	});

	it("size", () => {
		expect(() => {
			simplesValidator("size", "value");
		}).toThrowError("Validation rule size requires at least 1 parameters.");

		expect(simplesValidator("size:4", "qwe").get("key")).toBe("The key must be 4 characters.");
		expect(simplesValidator("size:4", "qwer")).toBeTruthy();
		expect(simplesValidator("size:4", "qwert").get("key")).toBe("The key must be 4 characters.");
		expect(simplesValidator("numeric|size:4", 3).get("key")).toBe("The key must be 4.");
		expect(simplesValidator("numeric|size:4", 4)).toBeTruthy();
		expect(simplesValidator("numeric|size:4", 5).get("key")).toBe("The key must be 4.");
		expect(simplesValidator("array|size:4", [1, 2, 3]).get("key")).toBe("The key must contain 4 items.");
		expect(simplesValidator("array|size:4", [1, 2, 3, 4])).toBeTruthy();
		expect(simplesValidator("array|size:4", [1, 2, 3, 4, 5]).get("key")).toBe("The key must contain 4 items.");
	});

	it("url", () => {
		expect(simplesValidator("url", "//some/thing").get("key")).toBe("The key format is invalid.");
		expect(simplesValidator("url", "https://gilmendes.wordpress.com")).be.equal(true);
		expect(simplesValidator("url", "https://duckduckgo.com/?q=stellar&t=osx&ia=meanings")).toBeTruthy();
	});
});
