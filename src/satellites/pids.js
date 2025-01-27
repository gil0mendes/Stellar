import fs from "node:fs";
import cluster from "node:cluster";

class Pids {
	/**
	 * API reference.
	 */
	api;

	/**
	 * Process ID.
	 */
	pid;

	/**
	 * Pids folder.
	 */
	path;

	/**
	 * Process title.
	 */
	title;

	/**
	 * Class constructor.
	 *
	 * @param api API reference.
	 */
	constructor(api) {
		// save API reference
		this.api = api;
	}

	/**
	 * Init the pid manager.
	 */
	init() {
		// set the process id
		this.pid = process.pid;

		// save pids folder to syntax sugar
		this.path = this.api.config.general.paths.pid;

		// define the process name
		if (cluster.isMaster) {
			this.title = `stellar-${this._sanitizeId()}`;
		} else {
			this.title = this._sanitizeId();
		}

		// create the 'pids' directory if not exists
		try {
			fs.mkdirSync(this.path);
		} catch (e) {
			// ignore error
		}
	}

	/**
	 * Write pid file.
	 */
	writePidFile() {
		fs.writeFileSync(`${this.path}/${this.title}`, this.pid.toString(), "ascii");
	}

	/**
	 * Clear pid file.
	 */
	clearPidFile() {
		try {
			fs.unlinkSync(`${this.path}/${this.title}`);
		} catch (e) {
			this.api.log("Unable to remove pidfile", "error", e);
		}
	}

	/**
	 * Get a sanitized pid name for this process.
	 *
	 * The pid name is based on the process id.
	 *
	 * @returns {*}
	 * @private
	 */
	_sanitizeId() {
		let pidfile = this.api.id;

		pidfile = pidfile.replace(/:/g, "-");
		pidfile = pidfile.replace(/\s/g, "-");
		pidfile = pidfile.replace(/\r/g, "");
		pidfile = pidfile.replace(/\n/g, "");

		return pidfile;
	}
}

export default class {
	/**
	 * Load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 110;

	/**
	 * Start priority.
	 *
	 * @type {number}
	 */
	startPriority = 1;

	/**
	 * Load initializer.
	 *
	 * @param api   API reference.
	 */
	async load(api) {
		api.pids = new Pids(api);
		api.pids.init();
	}

	/**
	 * Start initializer.
	 *
	 * @param api   API reference.
	 */
	async start(api) {
		api.pids.writePidFile();
		api.log(`pid: ${process.pid}`, "notice");
	}
}
