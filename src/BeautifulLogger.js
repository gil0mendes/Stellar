import common from "winston/lib/winston/common.js";
import os from "node:os";
import { Transport } from "winston";
import chalk from "chalk";
import util from "util";
import { Buffer } from "node:buffer";

// List of colors for each level
const colors = {
	emerg: "Red",
	alert: "Yellow",
	crit: "Red",
	error: "Red",
	warning: "Red",
	notice: "Yellow",
	info: "Green",
	debug: "Blue",
};

export default class BeautifulLogger extends Transport {
	constructor(options) {
		super(options);
		options = options || {};

		this.json = options.json || false;
		this.colorize = options.colorize || false;
		this.prettyPrint = options.prettyPrint || false;
		this.timestamp =
			typeof options.timestamp !== "undefined" ? options.timestamp : false;
		this.showLevel = options.showLevel === undefined ? true : options.showLevel;
		this.label = options.label || null;
		this.logstash = options.logstash || false;
		this.depth = options.depth || null;
		this.align = options.align || false;
		this.stderrLevels = BeautifulLogger.setStderrLevels(
			options.stderrLevels,
			options.debugStdout,
		);
		this.eol = options.eol || os.EOL;

		if (this.json) {
			this.stringify =
				options.stringify || ((obj) => JSON.stringify(obj, null, 2));
		}
	}

	static setStderrLevels(levels, debugStdout) {
		const defaultMsg = "Cannot have non-string elements in stderrLevels Array";
		if (debugStdout) {
			if (levels) {
				//
				// Don't allow setting both debugStdout and stderrLevels together,
				// since this could cause behaviour a programmer might not expect.
				//
				throw new Error("Cannot set debugStdout and stderrLevels together");
			}

			return common.stringArrayToSet(["error"], defaultMsg);
		}

		if (!levels) {
			return common.stringArrayToSet(["error", "debug"], defaultMsg);
		} else if (!Array.isArray(levels)) {
			throw new Error("Cannot set stderrLevels to type other than Array");
		}

		return common.stringArrayToSet(levels, defaultMsg);
	}

	/**
	 * Return the current date formatted.
	 *
	 * Format: 2017-04-21 18:23:38.310
	 *
	 * @returns {string}
	 */
	static getCurrentDate() {
		// get the current date
		const data = new Date();

		// build a string with the correct formatted date
		return `${data.getFullYear()}-${`0${data.getMonth() + 1}`.slice(-2)}-${`0${data.getDate()}`.slice(
			-2,
		)} ${`0${data.getHours()}`.slice(-2)}:${`0${data.getMinutes()}`.slice(
			-2,
		)}:${`0${data.getSeconds()}`.slice(-2)}.${`00${data.getMilliseconds()}`.slice(-3)}`;
	}

	/**
	 * Function log.
	 *
	 * @param level Level at which to log the message.
	 * @param msg Message to log
	 * @param meta **Optional** Additional metadata to attach
	 * @param callback Continuation to respond to when complete.
	 */
	log(level, msg, meta, callback) {
		// don't print when the transport is in silent
		if (this.silent) {
			return callback(null, true);
		}

		let output = "";

		// append the date if enabled
		if (this.timestamp) {
			const toPrint = ` ${BeautifulLogger.getCurrentDate()} `;
			output += this.colorize ? chalk.bgWhite.black(toPrint) : toPrint;
		}

		// append the level if enabled
		if (this.showLevel) {
			const backgroundColor = chalk[`bg${colors[level]}`];
			output += `${backgroundColor.black(` ${level.toUpperCase()} `)} `;
		}

		// append the message
		output += msg;

		// append metadata
		if (meta !== null && meta !== undefined) {
			// get stack from an Error instance
			if (meta && meta instanceof Error && meta.stack) {
				meta = meta.stack;
			}

			if (typeof meta !== "object") {
				output += ` ${meta}`;
			} else if (Object.keys(meta).length > 0) {
				if (typeof this.prettyPrint === "function") {
					output += ` ${this.prettyPrint(meta)}`;
				} else if (this.prettyPrint) {
					output += ` \n${util.inspect(meta, false, this.depth || null, this.colorize)}`;
				} else if (
					Object.keys(meta).length &&
					Object.prototype.hasOwnProperty.call(meta, "date") &&
					Object.prototype.hasOwnProperty.call(meta, "process") &&
					Object.prototype.hasOwnProperty.call(meta, "os") &&
					Object.prototype.hasOwnProperty.call(meta, "trace") &&
					Object.prototype.hasOwnProperty.call(meta, "stack")
				) {
					// if meta carries unhandled exception data serialize the stack nicely
					const stack = meta.stack;
					delete meta.stack;
					delete meta.trace;
					output += ` ${BeautifulLogger.serialize(meta)}`;

					if (stack) {
						output += `\n${stack.join("\n")}`;
					}
				} else {
					output += ` ${BeautifulLogger.serialize(meta)}`;
				}
			}
		}

		// print output the message to the STDOUT or STDERR, depending on log level
		const bytesToWrite = new TextEncoder().encode(`${output}${this.eol}`);
		if (this.stderrLevels[level]) {
			Deno.stderr.write(bytesToWrite);
		} else {
			Deno.stdout.write(bytesToWrite);
		}

		// Emit the `logged` event immediately because the event loop will not exit until `process.stdout` has drained
		// anyway.
		this.emit("logged");
		callback(null, true);
	}

	static serialize(obj, key) {
		// symbols cannot be directly casted to strings
		if (typeof key === "symbol") {
			key = key.toString();
		}
		if (typeof obj === "symbol") {
			obj = obj.toString();
		}

		if (obj === null) {
			obj = "null";
		} else if (obj === undefined) {
			obj = "undefined";
		} else if (obj === false) {
			obj = "false";
		}

		if (typeof obj !== "object") {
			return key ? `${key}=${obj}` : obj;
		}

		if (obj instanceof Buffer) {
			return key ? `${key}=${obj.toString("base64")}` : obj.toString("base64");
		}

		let msg = "";
		const keys = Object.keys(obj);
		const length = keys.length;

		for (let i = 0; i < length; i++) {
			if (Array.isArray(obj[keys[i]])) {
				msg += `${keys[i]}=[`;

				for (let j = 0, l = obj[keys[i]].length; j < l; j++) {
					msg += BeautifulLogger.serialize(obj[keys[i]][j]);
					if (j < l - 1) {
						msg += ", ";
					}
				}

				msg += "]";
			} else if (obj[keys[i]] instanceof Date) {
				msg += `${keys[i]}=${obj[keys[i]]}`;
			} else {
				msg += BeautifulLogger.serialize(obj[keys[i]], keys[i]);
			}

			if (i < length - 1) {
				msg += ", ";
			}
		}

		return msg;
	}
}
