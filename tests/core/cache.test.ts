import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

import Engine from "../../src/engine";
import { expect } from "vitest";

const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api = null;

describe("Core: Cache", () => {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	it("cache methods should exist", () => {
		expect(api.cache).toBeTypeOf("object");
		expect(api.cache.save).toBeTypeOf("function");
		expect(api.cache.load).toBeTypeOf("function");
		expect(api.cache.destroy).toBeTypeOf("function");
	});

	it("cache.save", async () => {
		await expect(api.cache.save("testKey", "test123", null)).resolves.toBeTruthy();
	});

	it("cache.load", async () => {
		await expect(api.cache.load("testKey")).resolves.toMatchObject({
			value: "test123",
		});
	});

	it("cache.load failure", async () =>
		expect(api.cache.load("thisNotExists")).rejects.toThrowError("Object not found"));

	it("cache.destroy", async () => expect(api.cache.destroy("testKey")).resolves.toBeTruthy());

	it("cache.destroy failure", async () => expect(api.cache.destroy("testKey")).resolves.toBeFalsy());

	it("cache.save with expire time", async () => expect(api.cache.save("testKey", "test123", 10)).resolves.toBeTruthy());

	it("cache.load with expired items should not return them", async () => {
		await expect(api.cache.save("testKeyWait", "test123", 10)).resolves.toBeTruthy();

		await api.utils.delay(20);
		await expect(api.cache.load("testKeyWait")).rejects.toThrowError("Object expired");
	});

	it("cache.load with negative expire times will never load", async () => {
		await expect(api.cache.save("testKeyInThePast", "test123", -1)).resolves.toBeTruthy();

		await expect(api.cache.load("testKeyInThePast")).rejects.toThrowError("Object expired");
	});

	it("cache.save does not need to pass expireTime", async () => {
		await expect(api.cache.save("testKeyForNullExpireTime", "test123")).resolves.toBeTruthy();

		await expect(api.cache.load("testKeyForNullExpireTime")).resolves.toMatchObject({ value: "test123" });
	});

	it("cache.load without changing the expireTime will re-apply the redis expire", async () => {
		const key = "testKey";

		await expect(api.cache.save(key, "val", 1000)).resolves.toBeTruthy();
		await expect(api.cache.load(key)).resolves.toMatchObject({ value: "val" });

		await api.utils.delay(1001);
		await expect(api.cache.load(key)).rejects.toThrowError("Object not found");
	});

	it("cache.load with options that extending expireTime should return cached item", async () => {
		const timeout = 200;
		const expireTime = 400;
		const value = "test123";
		const key = "testKeyWait";

		// save the initial key
		await expect(api.cache.save(key, value, expireTime)).resolves.toBeTruthy();

		// wait for `timeout` and try to load the key with a extended expireTime
		await api.utils.delay(timeout);
		await expect(
			api.cache.load(key, {
				expireTimeMS: expireTime,
			}),
		).resolves.toMatchObject({ value });

		// wait another `timeout` and load the key again without an extended expire time
		await api.utils.delay(timeout);
		await expect(api.cache.load(key)).resolves.toMatchObject({ value });

		// wait another `timeout` and the key load should fail without the extended time
		await api.utils.delay(timeout);
		await expect(api.cache.load(key)).rejects.toThrowError("Object not found");
	});

	it("cache.save works with arrays", async () => {
		await expect(api.cache.save("arrayKey", [1, 2, 3])).resolves.toBeTruthy();

		await expect(api.cache.load("arrayKey")).resolves.toMatchObject({
			value: [1, 2, 3],
		});
	});

	it("cache.save works with objects", async () => {
		const key = "objectKey";
		const data = {
			oneThing: "someData",
			otherThing: [1, 2, 3],
		};

		await expect(api.cache.save(key, data)).resolves.toBeTruthy();

		await expect(api.cache.load(key)).resolves.toMatchObject({
			value: {
				oneThing: "someData",
				otherThing: [1, 2, 3],
			},
		});
	});

	it("can clear the cache entirely", async () => {
		await api.cache.save("cacheClearKey", 123);

		await expect(api.cache.size()).resolves.toBeGreaterThan(0);

		await api.cache.clear();
		await expect(api.cache.size()).resolves.toBe(0);
	});

	describe("lists", () => {
		it("can push and pop from an array", async () => {
			const jobs = [];

			jobs.push(api.cache.push("testListKey", "a string"));
			jobs.push(api.cache.push("testListKey", ["an array"]));
			jobs.push(api.cache.push("testListKey", { look: "an object" }));

			// process the operations in parallel
			await expect(Promise.all(jobs)).resolves.toBeDefined();

			expect(api.cache.pop("testListKey")).resolves.toBe("a string");
			expect(api.cache.pop("testListKey")).resolves.toEqual(["an array"]);
			expect(api.cache.pop("testListKey")).resolves.toEqual({
				look: "an object",
			});
		});

		it("will return null if the list is empty", async () => expect(api.cache.pop("emptyListKey")).resolves.toBeNull());

		it("can get the length of an array when full", async () => {
			await expect(api.cache.push("testListKeyTwo", "a string")).resolves.toBeDefined();
			await expect(api.cache.listLength("testListKeyTwo")).resolves.toBe(1);
		});

		it("will return 0 length when the key does not exist", async () =>
			expect(api.cache.listLength("testListKeyNotExists")).resolves.toBe(0));
	});

	describe("locks", function () {
		const key = "testKey";

		// reset the lockName and unlock the key after each test
		afterEach(async () => {
			api.cache.lockName = api.id;
			await api.cache.unlock(key);
		});

		it("thing can be locked checked and unlocked", async () => {
			// lock a key
			await expect(api.cache.lock(key, 100)).resolves.toBeTruthy();

			// check the lock
			await expect(api.cache.checkLock(key, null)).resolves.toBeTruthy();

			// lock the key
			await expect(api.cache.unlock(key)).resolves.toBeTruthy();
		});

		it("locks have a TTL and the default will be assumed from config", async () => {
			// lock key
			await expect(api.cache.lock(key, null)).resolves.toBeTruthy();

			// check the lock TTL (Time To Live)
			await expect(api.redis.clients.client.ttl(api.cache.lockPrefix + key)).resolves.toBeLessThanOrEqual(10);
		});

		it("you can save an item if you do hold the lock", async () => {
			await expect(api.cache.lock(key, null)).resolves.toBeTruthy();
			await expect(api.cache.save(key, "value")).resolves.toBeTruthy();
		});

		it("you cannot save a locked item if you do not hold the lock", async () => {
			await expect(api.cache.lock(key, null)).resolves.toBeTruthy();

			// change the lock name
			api.cache.lockName = "otherId";

			await expect(api.cache.save(key, "someValue")).rejects.toThrowError("Object locked");
		});

		it("you cannot destroy a locked item if you do not hold the lock", async () => {
			await expect(api.cache.lock(key, null)).resolves.toBeTruthy();

			// change the lock name
			api.cache.lockName = "otherId";

			await expect(api.cache.destroy(key)).rejects.toThrowError("Object locked");
		});
	});
});
