/*eslint no-useless-catch: 0 */

import os from "node:os";
import fs from "node:fs";
import path, { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isPlainObject } from "ramda-adjunct";
import { both, has, propEq } from "ramda";

export const EXPAND_PREVENT_KEY = "_toExpand";

/**
 * Check if the object has an expand prevent key.
 */
const hasPreventExpand = both(has(EXPAND_PREVENT_KEY), propEq(EXPAND_PREVENT_KEY, false));

const isToExpand = (obj) => isPlainObject(obj) && !hasPreventExpand(obj);

export class ExtendableError extends Error {
	constructor(message) {
		super(message);
		this.name = this.constructor.name;
		if (typeof Error.captureStackTrace === "function") {
			Error.captureStackTrace(this, this.constructor);
		} else {
			this.stack = new Error(message).stack;
		}
	}
}

export class Utils {
	/**
	 * Reference for the API object.
	 *
	 * @type {}
	 */
	api = null;

	constructor(api = null) {
		this.api = api;
	}

	/**
	 * Check if object has key.
	 *
	 * @param {string} key key to be checked
	 * @param {object} object object to be check if has the key
	 */
	hasProp(key, object) {
		return Object.prototype.hasOwnProperty.call(object, key);
	}

	/**
	 * Gets the filesystem stats for the given file.
	 *
	 * @param {string} file path for the file
	 */
	async stats(file) {
		return new Promise((resolve, reject) => {
			fs.stat(file, (error, stats) => {
				if (error) {
					return reject(error);
				}

				return resolve(stats);
			});
		});
	}

	/**
	 * A Promise abstraction for the setTimeout function.
	 *
	 * @param t             Time in millisecond.
	 * @returns {Promise}
	 */
	delay(t) {
		return new Promise((resolve) => {
			setTimeout(resolve, t);
		});
	}

	/**
	 * Read all files from the given directory.
	 *
	 * @param dir         Folder path to search.
	 * @returns {Array}   Array with the files paths.
	 */
	getFiles(dir) {
		var results = [];

		fs.readdirSync(dir).forEach((file) => {
			file = `${dir}/${file}`;
			var stat = fs.statSync(file);

			if (stat && !stat.isDirectory()) {
				results.push(file);
			}
		});

		return results;
	}

	/**
	 * Read contents of the given file path.
	 *
	 * @param {string} filePath
	 * @returns {Promise<Buffer>}
	 */
	readFile(filePath) {
		return readFile(filePath);
	}

	readJsonFile(filePath) {
		return this.readFile(filePath).then((buffer) => JSON.parse(buffer.toString()));
	}

	/**
	 * Get all .js files in a directory.
	 *
	 * @param dir
	 * @param extensions
	 * @returns {Array.<T>}
	 */
	recursiveDirectoryGlob(dir, extensions = ["js", "ts"]) {
		const results = [];

		extensions = extensions.map((ext) => ext.replace(".", ""));

		if (dir[dir.length - 1] !== "/") {
			dir += "/";
		}

		if (!fs.existsSync(dir)) {
			return results;
		}

		fs.readdirSync(dir).forEach((file) => {
			const fullFilePath = path.normalize(dir + file);

			if (file[0] === ".") {
				return;
			}

			// ignore 'system' files
			const stats = fs.statSync(fullFilePath);
			let child;

			if (stats.isDirectory()) {
				child = this.recursiveDirectoryGlob(fullFilePath, extensions);
				child.forEach((c) => results.push(c));
			} else if (stats.isSymbolicLink()) {
				const realPath = fs.readlinkSync(fullFilePath);
				child = this.recursiveDirectoryGlob(realPath, extensions);
				child.forEach((c) => results.push(c));
			} else if (stats.isFile()) {
				const fileParts = file.split(".");
				const ext = fileParts[fileParts.length - 1];
				if (extensions.includes(ext)) {
					results.push(fullFilePath);
				}
			}
		});

		return results.sort();
	}

	/**
	 * Merge two hashes recursively.
	 *
	 * @param a
	 * @param b
	 * @param arg
	 * @returns {{}}
	 */
	hashMerge(a, b, arg) {
		let c = {};
		let i, response;

		for (i in a) {
			if (isToExpand(a[i])) {
				// can't be added into above condition, or empty objects will overwrite and not merge
				// also make sure empty objects are created
				c[i] = Object.keys(a[i]).length > 0 ? this.hashMerge(c[i], a[i], arg) : {};
			} else {
				if (typeof a[i] === "function") {
					response = a[i](arg);
					if (isToExpand(response)) {
						c[i] = this.hashMerge(c[i], response, arg);
					} else {
						c[i] = response;
					}
				} else {
					if (a[i] === undefined || a[i] === null) {
						// don't create first term if it is undefined or null
					} else {
						c[i] = a[i];
					}
				}
			}
		}
		for (i in b) {
			if (isToExpand(b[i])) {
				if (Object.keys(b[i]).length > 0) {
					// prevent empty objects from being overwrite
					c[i] = this.hashMerge(c[i], b[i], arg);
				} else if (!(i in c)) {
					// make sure objects are not created, when no key exists yet
					c[i] = {};
				}
			} else {
				if (typeof b[i] === "function") {
					response = b[i](arg);
					if (isToExpand(response)) {
						c[i] = this.hashMerge(c[i], response, arg);
					} else {
						c[i] = response;
					}
				} else {
					if (b[i] === undefined) {
						// ignore second term if is undefined
					} else if (b[i] === null && i in c) {
						// delete second term/key if value is null and ir already exists
						delete c[i];
					} else {
						c[i] = b[i];
					}
				}
			}
		}
		return c;
	}

	/**
	 * Cookie parse from headers of http(s) requests.
	 *
	 * @param req
	 * @returns {{}}
	 */
	parseCookies(req) {
		let cookies = {};
		if (req.headers.cookie) {
			req.headers.cookie.split(";").forEach(function (cookie) {
				let parts = cookie.split("=");
				cookies[parts[0].trim()] = (parts[1] || "").trim();
			});
		}
		return cookies;
	}

	/**
	 * Collapse this object to an array.
	 *
	 * @param obj
	 * @returns {*}
	 */
	collapseObjectToArray(obj) {
		try {
			let keys = Object.keys(obj);
			if (keys.length < 1) {
				return false;
			}
			if (keys[0] !== "0") {
				return false;
			}
			if (keys[keys.length - 1] !== String(keys.length - 1)) {
				return false;
			}

			let arr = [];
			for (let i in keys) {
				let key = keys[i];
				if (String(parseInt(key)) !== key) {
					return false;
				} else {
					arr.push(obj[key]);
				}
			}

			return arr;
		} catch (e) {
			return false;
		}
	}

	/**
	 * Unique-ify an array.
	 *
	 * @param array Array to be uniquefied.
	 * @returns {Array} New array.
	 */
	arrayUniqueify(array) {
		array.filter((value, index, self) => {
			return self.indexOf(value) === index;
		});

		return array;
	}

	isObject(arg) {
		return typeof arg === "object" && arg !== null;
	}

	objectToString(o) {
		return Object.prototype.toString.call(o);
	}

	isError(e) {
		return this.isObject(e) && (this.objectToString(e) === "[object Error]" || e instanceof Error);
	}

	/**
	 * Remove a directory.
	 *
	 * @param path   Directory path.
	 */
	removeDirectory(path) {
		let filesList;

		// get directory files
		try {
			filesList = fs.readdirSync(path);
		} catch (e) {
			return;
		}

		// iterate all folders and files on the directory
		filesList.forEach((file) => {
			// get full file path
			let filePath = `${path}/${file}`;

			// check if it's a file
			if (fs.statSync(filePath).isFile()) {
				fs.unlinkSync(filePath);
			} else {
				this.removeDirectory(filePath);
			}
		});

		try {
			fs.rmdirSync(path);
		} catch (_) {}
	}

	/**
	 * Check if the directory exists.
	 *
	 * @param dir           Directory path.
	 * @returns {boolean}   True if exists, false if not or the given path isn't a directory.
	 */
	directoryExists(dir) {
		try {
			fs.statSync(dir).isDirectory();
		} catch (er) {
			return false;
		}

		return true;
	}

	/**
	 * Check if a file exists.
	 *
	 * @param path          Path to check.
	 * @returns {boolean}   True if the file exists, false otherwise.
	 */
	fileExists(path) {
		try {
			fs.statSync(path).isFile();
		} catch (error) {
			return false;
		}

		return true;
	}

	/**
	 * Create a new directory.
	 *
	 * @param path Path there the directory must be created.
	 */
	createFolder(path) {
		try {
			fs.mkdirSync(path);
		} catch (e) {
			if (e.code !== "EEXIST") {
				throw e;
			}
		}
	}

	/**
	 * Copy a file.
	 *
	 * This only work with files.
	 *
	 * @param source        Source path.
	 * @param destination   Destination path.
	 */
	copyFile(source, destination) {
		fs.createReadStream(source).pipe(fs.createWriteStream(destination));
	}

	/**
	 * Get this servers external interface.
	 *
	 * @returns {String} Server external IP or false if not founded.
	 */
	getExternalIPAddress() {
		let ifaces = os.networkInterfaces();
		let ip = false;

		for (let dev in ifaces) {
			ifaces[dev].forEach((details) => {
				if (details.family === "IPv4" && details.address !== "127.0.0.1") {
					ip = details.address;
				}
			});
		}

		return ip;
	}

	/**
	 * Make a clone of an object.
	 *
	 * @param obj         Object to be cloned.
	 * @returns {Object}  New object reference.
	 */
	objClone(obj) {
		return Object.create(
			Object.getPrototypeOf(obj),
			Object.getOwnPropertyNames(obj).reduce((memo, name) => {
				return (memo[name] = Object.getOwnPropertyDescriptor(obj, name)) && memo;
			}, {}),
		);
	}

	stringToHash(api, path, object) {
		if (!object) {
			object = api;
		}
		function _index(obj, i) {
			return obj[i];
		}

		return path.split(".").reduce(_index, object);
	}

	/**
	 * Parse an IPv6 address.
	 *
	 * @param address   Address to be parsed.
	 * @returns {{host: string, port: Number}}
	 */
	parseIPv6URI(address) {
		let host = "::1";
		let port = 80;
		let regexp = new RegExp(/\[([0-9a-f:]+)\]:([0-9]{1,5})/);

		// if we have brackets parse them and find a port
		if (address.indexOf("[") > -1 && address.indexOf("]") > -1) {
			// execute the regular expression
			let res = regexp.exec(address);

			// if null this isn't a valid IPv6 address
			if (res === null) {
				throw new Error("failed to parse address");
			}

			host = res[1];
			port = res[2];
		} else {
			host = address;
		}

		return { host: host, port: parseInt(port, 10) };
	}

	/**
	 * Check if a file/folder exists.
	 *
	 * @param path
	 * @returns {boolean}
	 */
	exists(path) {
		try {
			fs.accessSync(path, fs.F_OK);
			return true;
		} catch (e) {
			// it will return false either way
		}

		return false;
	}

	/**
	 * Remove the object pointed by the path (file/directory).
	 *
	 * This function checks if the path exists before try remove him.
	 *
	 * @param path  Path to be removed.
	 */
	removePath(path) {
		// if the path don't exists return
		if (!this.exists(path)) {
			return;
		}

		// if the path is a file remote it and return
		if (fs.statSync(path).isFile()) {
			return fs.unlinkSync(path);
		}

		// remove all the directory content
		this.removeDirectory(path);
	}

	/**
	 * Create a new folder.
	 *
	 * @param String dir  Path for the directory to be created.
	 */
	mkdir(dir, mode) {
		try {
			fs.mkdirSync(dir, mode);
		} catch (e) {
			if (e.code === "ENOENT") {
				this.mkdir(path.dirname(dir), mode);
				this.mkdir(dir, mode);
			}
		}
	}

	/**
	 * Custom require function to load from the core scope and then from the project scope.
	 *
	 * ESM isn't able to resolve directories so we need to do that ourselves.
	 *
	 * @param {string} path
	 */
	async require(path) {
		let attemptPath = path;

		// try to load the dependency from the core. If it fails we need to load it from the project dependencies; and it's
		// here where the adventures starts, before there is no way to automatically resolve dependencies, we need to find
		// out what is the file to load.
		return import(attemptPath).catch(async () => {
			attemptPath = `${this.api.scope.rootPath}/node_modules/${path}`;

			// if it's a directory and has a package.json file we must check for the `main` property on it. It will tell us
			// which directory we should check for the export files.
			const possiblePackageJsonPath = join(attemptPath, "package.json");
			if (this.directoryExists(attemptPath) && this.fileExists(possiblePackageJsonPath)) {
				const pkgMetaContent = await this.readJsonFile(possiblePackageJsonPath);

				// if the main property exists we use it to try on the new location
				if (pkgMetaContent["main"]) {
					attemptPath = join(attemptPath, pkgMetaContent["main"]);
				}
			}

			// if the path it's a directory we append the `index.js` file
			if (this.directoryExists(attemptPath)) {
				attemptPath = join(attemptPath, "index.js");
			}

			return import(attemptPath);
		});
	}

	// ------------------------------------------------------------- [Type Checks]

	/**
	 * Checks if the given var is an non empty string.
	 *
	 * @param {string} value Value to be validated.
	 */
	isNonEmptyString(value) {
		return typeof value === "string" && value.length > 0;
	}

	// ----------------------------------------------------------------- [Strings]

	/**
	 * Convert snake case string to camel case.
	 *
	 * @param {string} s String to be converted.
	 */
	snakeToCamel(s) {
		return s.replace(/(\_\w)/g, (m) => m[1].toUpperCase());
	}

	/**
	 * Generate a random string with the given length.
	 *
	 * @param {Number} length size of the generated string. By default this
	 * parameters is set to 16.
	 */
	randomStr(length = 16) {
		const characterEntropy = Math.ceil(length * 0.5);
		return randomBytes(characterEntropy).toString("hex").slice(0, length);
	}
}

export default class {
	/**
	 * Satellite load priority.
	 *
	 * @type {Number}
	 */
	loadPriority = 0;

	async load(api) {
		api.utils = new Utils(api);
	}
}

if (import.meta.vitest) {
	const { it, expect } = import.meta.vitest;

	it("hasPreventExpand", () => {
		expect(hasPreventExpand({ [EXPAND_PREVENT_KEY]: false })).toBeTruthy();
		expect(hasPreventExpand({ [EXPAND_PREVENT_KEY]: true })).toBeFalsy();
		expect(hasPreventExpand({ [EXPAND_PREVENT_KEY]: null })).toBeFalsy();
		expect(hasPreventExpand({ other: "key" })).toBeFalsy();
		expect(hasPreventExpand({})).toBeFalsy();
	});
}
