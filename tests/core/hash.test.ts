import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

import Engine from "../../src/engine";
import { expect } from "vitest";
import { API } from "../../src/common/types/api.types.ts";
import process from "node:process";

const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api: API;

const SALT = "$2a$10$8Ux95eQglaUMSn75J7MAXO";
const TEST_PASSWORD = "MY_GREAT_PASSWORD";
const TEST_PASSWORD_HASHED = "$2a$10$8Ux95eQglaUMSn75J7MAXOrHISe8xlR596kiYoVs2shRznjzD5CGC";

describe("Core: Hash", () => {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	/**
	 * After each test reset the hash configs
	 */
	afterEach(() => {
		api.config.general.salt = null;
		api.config.general.saltLength = 10;
		api.config.general.saltRounds = 10;
	});

	it("is part of the API", () => {
		expect(api.hash).toBeDefined();
		expect(api.hash).toHaveProperty("hash");
		expect(api.hash).toHaveProperty("hashSync");
		expect(api.hash).toHaveProperty("compare");
		expect(api.hash).toHaveProperty("compareSync");
	});

	it("generate salt", () => {
		return expect(api.hash.generateSalt()).resolves.toBeTypeOf("string");
	});

	it("generate salt in sync mode", () => {
		expect(api.hash.generateSaltSync()).toBeTypeOf("string");
	});

	it("hash data without options", async () => {
		const result = await api.hash.hash(TEST_PASSWORD);
		expect(result).toBeTypeOf("string");
	});

	it("hash data with predefined salt", async () => {
		api.config.general.salt = SALT;
		const result = await api.hash.hash(TEST_PASSWORD);
		expect(result).toBe(TEST_PASSWORD_HASHED);
	});

	it("hash data with predefined salt length", () => {
		api.config.general.saltLength = 8;
		const result = api.hash.hashSync(TEST_PASSWORD);
		expect(result).toBeTypeOf("string");
	});

	it("hash data with auto-generated salt", () => {
		const salt = api.hash.generateSaltSync(5);
		const result = api.hash.hashSync(TEST_PASSWORD, { salt });
		expect(result).toBeTypeOf("string");
	});

	it("throw exception on hash with wrong salt", async () => {
		api.config.general.salt = "invalid_salt";
		await expect(api.hash.hash("some_data")).rejects.toThrowError();
	});

	it("hash data in sync", () => {
		api.config.general.salt = SALT;
		const result = api.hash.hashSync(TEST_PASSWORD);
		expect(result).toBe(TEST_PASSWORD_HASHED);
	});

	it("compare plain data with hash", async () => {
		const result = await api.hash.compare(TEST_PASSWORD, TEST_PASSWORD_HASHED);
		expect(result).toBe(true);
	});

	it("compare plain data with hash in sync", () => {
		expect(api.hash.compareSync(TEST_PASSWORD, TEST_PASSWORD_HASHED)).toBeTruthy();
		expect(api.hash.compareSync("wrong_password", TEST_PASSWORD_HASHED)).toBeFalsy();
	});
});
