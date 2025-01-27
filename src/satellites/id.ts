import cluster from "node:cluster";
import { fetchJsonFile } from "../utils.js";
import { resolve } from "node:path";

/**
 * Setup the server ID.
 *
 * This ID, can be configured using:
 * - the 'api.config.general.id' configuration;
 * - '--title' option on the command line;
 * - 'STELLAR_TITLE' environment variable;
 * - or one can be generated automatically using the external server IP.
 */
export default class {
	/**
	 * Load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 100;

	/**
	 * Start priority.
	 *
	 * @type {number}
	 */
	startPriority = 2;

	/**
	 * Initializer load functions.
	 *
	 * @param api   API reference.
	 */
	async load(api) {
		const argv = api.scope.args;

		if (argv.title) {
			api.id = argv.title;
		} else if (process.env.STELLAR_TITLE) {
			api.id = process.env.STELLAR_TITLE;
		} else if (!api.config.general.id) {
			// get servers external IP
			const externalIP = api.utils.getExternalIPAddress();

			if (externalIP === false) {
				const message = " * Error fetching this host external IP address; setting id base to 'stellar'";

				try {
					api.log(message, "crit");
				} catch (e) {
					console.error(message);
				}
			}

			api.id = externalIP;
			if (cluster.isWorker) {
				api.id += `:${process.pid}`;
			}
		} else {
			api.id = api.config.general.id;
		}

		// save Stellar version
		const pkgMetadataPath = resolve(import.meta.dirname, "../../package.json");
		api.stellarVersion = (await fetchJsonFile(pkgMetadataPath)).version;
	}

	/**
	 * Initializer start function.
	 *
	 * @param api   API reference.
	 */
	async start(api) {
		api.log(`server ID: ${api.id}`, "notice");
	}
}
