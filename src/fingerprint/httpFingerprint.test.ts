import { afterAll, beforeAll, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertNotEquals } from "@std/assert";
import { DEFAULT_COOKIE_KEY, HttpFingerprint } from "./httpFingerprint.ts";

const hostname = "localhost";
const port = 8085;
const url = `http://${hostname}:${port}`;

let server: Deno.HttpServer;
let abortController: AbortController;

let httpFingerprint = new HttpFingerprint();

type MakeRequestOptions = {
	headers?: Headers;
};

const makeRequest = async (method: "GET", { headers }: MakeRequestOptions = {}) => {
	const response = await fetch(url, { method, headers });
	const body = await response.text();

	return {
		headers: response.headers,
		body,
	};
};

const extractFingerprintFromCookie = (headers: Headers) => headers.getSetCookie()[0].split("=")[1];

describe("HTTP fingerprint", () => {
	beforeAll(() => {
		abortController = new AbortController();

		server = Deno.serve({ signal: abortController.signal, hostname, port }, async (req, info) => {
			const { fingerprint, headersHash, propertiesHash } = await httpFingerprint.fingerprint(req, info);

			headersHash["Content-Type"] = "text/plain";

			let resp = `Fingerprint: ${fingerprint} \r\n\r\n`;
			for (const i in propertiesHash) {
				resp = `${resp}Element ${i}: ${propertiesHash[i]}\r\n`;
			}

			return new Response(resp, { status: 200, headers: headersHash });
		});
	});

	afterAll(() => {
		abortController.abort();

		return server.finished;
	});

	it("works with defaults", async () => {
		const { headers, body } = await makeRequest("GET");

		const fingerprintCookie = extractFingerprintFromCookie(headers);
		assert(fingerprintCookie);

		const fingerprint = extractFingerprintFromCookie(headers);
		assert(body.includes(fingerprint));
	});

	it("generates a new fingerprint for a new request", async () => {
		const response1 = await makeRequest("GET");
		const firstFingerprint = extractFingerprintFromCookie(response1.headers);

		const response2 = await makeRequest("GET");
		const secondFingerprint = extractFingerprintFromCookie(response2.headers);

		assertNotEquals(firstFingerprint, secondFingerprint);
	});

	it("will return the same fingerprint when the request already has a cookie with it", async () => {
		// do a first request to get a fingerprint
		const initialResponse = await makeRequest("GET");
		const initialFingerprint = extractFingerprintFromCookie(initialResponse.headers);

		// craft a request with the fingerprint set via cookie, it should return the same one
		const cookie = `${DEFAULT_COOKIE_KEY}=${initialFingerprint};`;
		const headers = new Headers();
		headers.append("cookie", cookie);
		const response = await makeRequest("GET", { headers });

		// no cookie should be set
		assertFalse(response.headers.has("set-cookie"));

		// and the body should contains the fingerprint
		assert(response.body.includes(initialFingerprint));
	});

	it("will return the same fingerprint when the request already have it set via header", async () => {
		// do a first request to get a fingerprint
		const initialResponse = await makeRequest("GET");
		const initialFingerprint = extractFingerprintFromCookie(initialResponse.headers);

		// craft a request with the fingerprint set via header, it should return the same one
		const headers = new Headers();
		headers.append(DEFAULT_COOKIE_KEY, initialFingerprint);
		const response = await makeRequest("GET", { headers });

		// no cookie should be set
		assertFalse(response.headers.has("set-cookie"));

		// and the body should contains the fingerprint
		assert(response.body.includes(initialFingerprint));
	});

	it("support a custom cookie key", async () => {
		httpFingerprint = new HttpFingerprint({ cookieKey: "myKey" });
		const response = await makeRequest("GET");

		const cookiesKey = response.headers.get("set-cookie")?.split("=")[0];
		assertEquals(cookiesKey, "myKey");
	});

	it("can disable setting the cookie", async () => {
		httpFingerprint = new HttpFingerprint({ toSetCookie: false });

		const response = await makeRequest("GET");
		assertFalse(response.headers.has("set-cookie"));
	});

	it("sets the cookie setting when no specific settings are specified", async () => {
		httpFingerprint = new HttpFingerprint({ settings: {} });
		const response = await makeRequest("GET");

		const cookie = response.headers.get("set-cookie")?.split(";");
		const httpOnlyDirective = cookie?.[1];
		const pathDirective = cookie?.[2];
		const secureDirective = cookie?.[3];

		assert(httpOnlyDirective);
		assert(pathDirective);
		assert(secureDirective);
	});

	it("allows to configure the cookie directives", async () => {
		httpFingerprint = new HttpFingerprint({ settings: { httpOnly: true, path: "/", expires: 3600000, secure: false } });

		const response = await makeRequest("GET");

		const cookie = response.headers.get("set-cookie")?.split(";");
		const httpOnlyDirective = cookie?.[1];
		const pathDirective = cookie?.[2];
		const secureDirective = cookie?.[3];

		assertEquals(httpOnlyDirective, "httpOnly=true");
		assertEquals(pathDirective, "path=/");
		assertEquals(secureDirective, "secure");
	});
});
