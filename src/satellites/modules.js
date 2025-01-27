import fs from "node:fs";
import { exec } from "node:child_process";

/**
 * This class is responsible to manage all modules, process
 * the NPM dependencies.
 */
class Modules {
	/**
	 * API reference object.
	 *
	 * @type {null}
	 */
	api = null;

	/**
	 * Map with the active modules.
	 *
	 * Keys are the modules slugs and the values are
	 * their manifests.
	 *
	 * @type {Map}
	 */
	activeModules = new Map();

	/**
	 * Map with the modules paths.
	 *
	 * @type {Map}
	 */
	modulesPaths = new Map();

	/**
	 * This map contains all the actions who are part of each module.
	 *
	 * @type {Map}
	 */
	moduleActions = new Map();

	/**
	 * Create a new class instance.
	 *
	 * @param api
	 */
	constructor(api) {
		this.api = api;
	}

	/**
	 * Register a new action name for a module.
	 *
	 * @param {string} moduleName Module name
	 * @param {string|array} value Array of action name to be stored.
	 */
	regModuleAction(moduleName, value) {
		// first, check there is already a slot to store the actions of this module
		if (!this.moduleActions.has(moduleName)) {
			this.moduleActions.set(moduleName, []);
		}

		// get the array where the action name must be stored
		const arrayOfActions = this.moduleActions.get(moduleName);

		if (Array.isArray(value)) {
			this.moduleActions.set(moduleName, arrayOfActions.concat(value));
		} else if (this.api.utils.isNonEmptyString(value)) {
			arrayOfActions.push(value);
		} else {
			throw new Error("Value got an invalid state");
		}
	}

	/**
	 * Load all active modules into memory.
	 *
	 * The private module is always loaded even if not present on the activeModules property.
	 */
	async loadModules() {
		// get active modules
		let modules = this.api.config.modules;

		// check if the private module folder exists
		if (this.api.utils.directoryExists(`${this.api.scope.rootPath}/modules/private`)) {
			modules.push("private");
		}

		// this config is required. If doesn't exists or is an empty array an exception should be raised.
		if (modules === undefined || modules.length === 0) {
			throw new Error("At least one module needs to be active.");
		}

		// load all modules declared in the manifest file
		for (const moduleName of modules) {
			// build the full path
			const path = `${this.api.scope.rootPath}/modules/${moduleName}`;

			// get module manifest file content
			try {
				const manifest = await this.api.utils.readJsonFile(`${path}/manifest.json`);

				// save the module config on the engine instance
				this.activeModules.set(manifest.id, manifest);

				// save the module full path
				this.modulesPaths.set(manifest.id, path);
			} catch (e) {
				throw new Error(
					`There is an invalid module active, named "${moduleName}", fix this to start Stellar normally.`,
				);
			}
		}
	}

	/**
	 * Process all NPM dependencies.
	 *
	 * The npm install command only is executed if the package.json file are not present.
	 */
	processNpmDependencies() {
		// don't use NPM on test environment (otherwise the tests will fail)
		if (this.api.env === "test") {
			return;
		}

		// get scope variable
		const scope = this.api.scope;

		// check if the stellar is starting in clean mode. If yes we need remove all
		// temporary files and process every thing again
		if (scope.args.clean) {
			// list of temporary files
			let tempFilesLocations = [
				`${scope.rootPath}/temp`,
				`${scope.rootPath}/package.json`,
				`${scope.rootPath}/node_modules`,
			];

			// iterate all temp paths and remove all of them
			tempFilesLocations.forEach((path) => this.api.utils.removePath(path));
		}

		// if the `package.json` file already exists and Stellar isn't starting with
		// the `update` flag return now
		if (this.api.utils.fileExists(`${scope.rootPath}/package.json`) && !scope.args.update) {
			return;
		}

		// global npm dependencies
		let npmDependencies = {};

		// iterate all active modules
		this.activeModules.forEach((manifest) => {
			// check if the module have NPM dependencies
			if (manifest.npmDependencies !== undefined) {
				// merge the two hashes
				npmDependencies = this.api.utils.hashMerge(npmDependencies, manifest.npmDependencies);
			}
		});

		// compile project information
		let projectJson = {
			private: true,
			name: "stellar-dependencies",
			version: "1.0.0",
			type: "module",
			description: "This is automatically generated don't edit",
			dependencies: npmDependencies,
		};

		// generate project.json file
		const packageJsonPath = `${this.api.scope.rootPath}/package.json`;
		this.api.utils.removePath(packageJsonPath);
		fs.writeFileSync(packageJsonPath, JSON.stringify(projectJson, null, 2), "utf8");

		this.api.log("updating NPM packages", "info");

		// check the command to be executed
		const npmCommand = scope.args.update ? "npm update" : "npm install";

		// run npm command
		return new Promise((resolve, reject) => {
			exec(npmCommand, (error) => {
				if (error) {
					this.api.log("An error occurs during the NPM install command", "emergency");
					return reject(error);
				}

				this.api.log("NPM dependencies updated!", "info");
				resolve();
			});
		});
	}
}

/**
 * This initializer loads all active modules configs to the
 * engine instance.
 */
export default class {
	/**
	 * Initializer load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 1;

	/**
	 * Initializer load function.
	 *
	 * @param api   API reference.
	 */
	async load(api) {
		api.modules = new Modules(api);
		await api.modules.loadModules();
		await api.modules.processNpmDependencies();
	}
}
