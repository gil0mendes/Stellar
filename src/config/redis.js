import IORedis from "ioredis";
import MockRedis from "ioredis-mock";

/**
 * Redis configs.
 *
 * constructor  - the redis client constructor method (package)
 * args         - the arguments to pass to the constructor
 * buildNew     - is to use the `new` keyword on the the constructor?
 */
export default {
	redis() {
		// get parameters from the environment or use defaults
		let protocol = process.env.REDIS_SSL ? "rediss" : "redis";
		let host = process.env.REDIS_HOST || "127.0.0.1";
		let port = process.env.REDIS_PORT || 6379;
		let db = process.env.REDIS_DB || process.env.VITEST_WORKER_ID || 0;
		let password = process.env.REDIS_PASS || null;

		if (process.env.REDIS_URL) {
			const parsed = new URL(process.env.REDIS_URL);
			if (parsed.protocol) protocol = parsed.protocol.split(":")[0];
			if (parsed.password) password = parsed.password;
			if (parsed.hostname) host = parsed.hostname;
			if (parsed.port) port = parsed.port;
			if (parsed.pathname) db = parsed.pathname.substring(1);
		}

		const commonArgs = {
			port,
			host,
			password,
			db: parseInt(db),
			tls: protocol === "redis" ? { rejectUnauthorized: false } : undefined,
			retryStrategy: (times) => {
				if (times === 1) {
					console.error("Unable to connect to Redis - please check your Redis config!");
					return 5000;
				}
				return Math.min(times * 50, maxBackoff);
			},
		};

		const RedisConstructor = process.env.FAKEREDIS === "false" || process.env.REDIS_HOST !== undefined
			? IORedis
			: MockRedis;

		return {
			_toExpand: false,

			client: {
				constructor: RedisConstructor,
				args: [commonArgs],
				buildNew: true,
			},
			subscriber: {
				constructor: RedisConstructor,
				args: [commonArgs],
				buildNew: true,
			},
			tasks: {
				constructor: RedisConstructor,
				args: [commonArgs],
				buildNew: true,
			},
		};
	},
};
