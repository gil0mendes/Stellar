import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

import Engine from "../../src/engine";
import { expect } from "vitest";
import { API } from "../../src/common/types/api.types.ts";

const engine = new Engine({ rootPath: `${process.cwd()}/example` });

let api: API;

describe("Core: Chat", () => {
	beforeAll(async () => {
		api = await engine.start();
	});

	afterAll(() => engine.stop());

	afterEach(async () => {
		try {
			await api.chatRoom.destroy("newRoom");
		} catch (e) {}
		try {
			await api.chatRoom.destroy("otherRoom");
		} catch (e) {}
	});

	it("can check if rooms exist", async () => {
		await expect(api.chatRoom.exists("defaultRoom")).resolves.toBeTruthy();
	});

	it("can check if a room does not exits", async () => {
		await expect(api.chatRoom.exists("missingRoom")).resolves.toBeFalsy();
	});

	it("server can create new room", async () => {
		// creates the new room
		await api.chatRoom.create("newRoom");

		// check if the room exists
		await expect(api.chatRoom.exists("newRoom")).resolves.toBeTruthy();
	});

	it("server cannot create already existing room", async () => {
		await expect(api.chatRoom.create("defaultRoom")).rejects.toThrowError("Room (defaultRoom) already exists");
	});

	it("can enumerate all the rooms in the system", async () => {
		// create two rooms
		await api.chatRoom.create("newRoom");
		await api.chatRoom.create("otherRoom");

		// request the list of rooms
		await expect(api.chatRoom.list()).resolves.toEqual(["defaultRoom", "newRoom", "otherRoom"]);
	});

	it("server can destroy a existing room", async () => {
		// creates the new room
		await api.chatRoom.create("newRoom");

		// remove the created room
		await expect(api.chatRoom.destroy("newRoom")).resolves.toBeTruthy();
	});

	it("server can not destroy a non existing room", async () => {
		await expect(api.chatRoom.destroy("nonExistingRoom")).rejects.toThrowError(
			"Room (nonExistingRoom) does not exists",
		);
	});

	it("server can add connections to a room", async () => {
		const client = api.helpers.connection();

		// the client must have zero rooms
		expect(client.rooms).toHaveLength(0);

		// add the client to the room
		await api.chatRoom.join(client.id, "defaultRoom");

		// now the client must have one connection
		expect(client.rooms[0]).toBe("defaultRoom");

		await client.destroy();
	});

	it("will not re-add a member to a room", async () => {
		const client = api.helpers.connection();

		// the client must have zero rooms
		expect(client.rooms).toHaveLength(0);

		// add the client to the room
		await api.chatRoom.join(client.id, "defaultRoom");

		// try add the client to the same room
		await expect(api.chatRoom.join(client.id, "defaultRoom")).rejects.toThrowError(
			`Connection (${client.id}) already in room (defaultRoom)`,
		);

		await client.destroy();
	});

	it("will not add a member to a non-existing room", async () => {
		const client = api.helpers.connection();

		// the client must have zero rooms
		expect(client.rooms).toHaveLength(0);

		// add the client to a non-existing room
		await expect(api.chatRoom.join(client.id, "noExists")).rejects.toMatchObject({
			code: "019",
		});

		await client.destroy();
	});

	it("server will not remove a member not in a room", async () => {
		const client = api.helpers.connection();

		await expect(api.chatRoom.leave(client.id, "noExists")).rejects.toThrowError(
			`Connection (${client.id}) not in room (noExists)`,
		);

		await client.destroy();
	});

	it("server can remove connections from a room", async () => {
		const client = api.helpers.connection();

		// add the client to a room
		await api.chatRoom.join(client.id, "defaultRoom");

		await expect(api.chatRoom.leave(client.id, "defaultRoom")).resolves.toBeTruthy();

		await client.destroy();
	});

	it("server can destroy a room and connections will be removed", async () => {
		const client = api.helpers.connection();

		// create a new room
		await api.chatRoom.create("newRoom");

		// add the client to it
		await api.chatRoom.join(client.id, "newRoom");
		expect(client.rooms[0]).toBe("newRoom");

		// destroy the room
		await expect(api.chatRoom.destroy("newRoom")).resolves.toBeTruthy();

		expect(client.rooms).toHaveLength(0);

		await client.destroy();
	});

	it("can get a list of rooms members", async () => {
		const client = api.helpers.connection();

		// add the client to the room
		await api.chatRoom.join(client.id, "defaultRoom");

		const status = await api.chatRoom.status("defaultRoom");

		expect(status.room).toBe("defaultRoom");
		expect(status.membersCount).toBe(1);

		await client.destroy();
	});
});
