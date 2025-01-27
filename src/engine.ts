/* eslint-disable @typescript-eslint/ban-ts-comment */
import path, { join } from "node:path";
import { Utils as UtilsClass } from "./satellites/utils.js";
import { ensureNoTsHeaderOrSpecFiles, safeGlob } from "./utils/file.ts";

// FIXME: this is a temporary workaround, we must make this more professional
const Utils = new UtilsClass();

// This stores the number of times that Stellar was started. Every time that
// Stellar restarts this is incremented by 1
let startCount = 0;

/**
 * Main Stellar entry point class.
 *
 * This makes the system bootstrap, loading and execution all satellites. Each
 * initializer load new features to the engine instance or perform a set of
 * instruction to accomplish a certain goal.
 */
export default class Engine {
	// --------------------------------------------------------------------------- [STATIC]

	/**
	 * Default proprieties for the satellites.
	 *
	 * @type {{load: number, start: number, stop: number}}
	 */
	static defaultPriorities = {
		load: 100,
		start: 100,
		stop: 100,
	};

	/**
	 * Normalize satellite priorities.
	 *
	 * @param satellite Satellite instance to be normalized.
	 */
	static normalizeInitializerPriority(satellite) {
		satellite.loadPriority = satellite.loadPriority || Engine.defaultPriorities.load;
		satellite.startPriority = satellite.startPriority || Engine.defaultPriorities.start;
		satellite.stopPriority = satellite.stopPriority || Engine.defaultPriorities.stop;
	}

	/**
	 * Order satellites array by their priority.
	 *
	 * @param collection  Satellites array to be ordered.
	 * @returns {Array}   New ordered array.
	 */
	static flattenOrderedInitializer(collection) {
		const keys = [];
		const output = [];

		// get keys from the collection
		for (const key in collection) {
			keys.push(parseInt(key));
		}

		// sort the keys in ascendant way
		keys.sort((a, b) => a - b);

		// iterate the ordered keys and create the new ordered object to be
		// outputted
		keys.forEach((key) => collection[key].forEach((d) => output.push(d)));

		// return the new ordered object
		return output;
	}

	/**
	 * Print fatal error on the console and exit from the engine execution.
	 *
	 * @param errors  String or array with the fatal error(s).
	 * @param type    String with the error type.
	 */
	private async fatalError(errors, type) {
		// if errors variables if not defined return
		if (!errors) {
			return;
		}

		// ensure the errors variable is an Array
		if (!Array.isArray(errors)) {
			errors = [errors];
		}

		// log an emergency message
		console.log(errors);
		this.api.log(`Error with satellite step: ${type}`, "emerg");

		// log all the errors
		errors.forEach((err) => this.api.log(err, "emerg"));

		// finish the process execution
		await this.stop();
		Deno.exit(1);
	}

	// --------------------------------------------------------------------------- [Class]

	/**
	 * API object.
	 *
	 * This object will be shared across all the platform, it's here the
	 * satellites will load logic and the developers access the functions.
	 *
	 * @type {{}}
	 */
	api = {
		bootTime: null,
		status: "stopped",

		commands: {
			initialize: null,
			start: null,
			stop: null,
			restart: null,
		},

		log: null,

		scope: {},
	};

	/**
	 * List with all satellites.
	 *
	 * @type {{}}
	 */
	satellites = {};

	/**
	 * Array with the initial satellites.
	 *
	 * @type {Array}
	 */
	initialSatellites = [];

	/**
	 * Array with the load satellites.
	 *
	 * This array contains all the satellites who has a load method.
	 *
	 * @type {Array}
	 */
	loadSatellites = [];

	/**
	 * Array with the start satellites.
	 *
	 * This array contains all the satellites who has a start method.
	 *
	 * @type {Array}
	 */
	startSatellites = [];

	/**
	 * Array with the stop satellites.
	 *
	 * This array contains all the satellites who has a stop method.
	 *
	 * @type {Array}
	 */
	stopSatellites = [];

	/**
	 * Create a new instance of the Engine.
	 *
	 * @param scope Initial scope
	 */
	constructor(scope) {
		// save current execution scope
		this.api.scope = scope;

		// define args if them are not already defined
		if (!this.api.scope.args) {
			this.api.scope.args = {};
		}

		// define a dummy logger
		//
		// this only should print error, emergency levels
		this.api.log = (msg, level = "info") => {
			// if we are on test environment don't use the console
			if (process.env.NODE_ENV === "test") {
				return;
			}

			if (level === "emergency" || level === "error") {
				return console.error(`\x1b[31m[-] ${msg}\x1b[37m`);
			} else if (level === "info") {
				return console.info(`[!] ${msg}`);
			} else if (level !== "debug") {
				console.log(`[d] ${msg}`);
			}
		};

		// define the available engine commands
		this.api.commands = {
			initialize: this.initialize,
			start: this.start,
			stop: this.stop,
			restart: this.restart,
		};
	}

	// --------------------------------------------------------------------------- [State Manager Functions]

	async initialize() {
		this.api.log(`Current universe "${this.api.scope.rootPath}"`, "info");
		await this.stage0();

		return this.api;
	}

	/**
	 * Start engine execution.
	 */
	async start() {
		startCount = 0;

		// in the case of the engine not have been initialized do it now
		if (this.api.status !== "init_stage0") {
			await this.initialize();
		}

		await this.stage1();

		return this.api;
	}

	/**
	 * Stop the Engine execution.
	 *
	 * This method try shutdown the engine in a non violent way, this starts to execute all the stop method on the
	 * supported satellites.
	 */
	async stop() {
		if (this.api.status === "shutting_down") {
			// double sigterm; ignore it
			return;
		} else if (this.api.status !== "running") {
			this.api.log("Cannot shutdown Stellar, not running", "error");
			return;
		}

		// change the status, so we know when we are already shutting down
		this.api.status = "shutting_down";
		this.api.log("Shutting down open servers and stopping task processing", "alert");

		// iterate all satellites and stop them
		try {
			for (const stopFn of this.stopSatellites) {
				await stopFn?.();
			}
		} catch (error) {
			return this.fatalError(error, "stop");
		}

		this.api.configs.unwatchAllFiles();
		this.api.pids.clearPidFile();
		this.api.log("Stellar has been stopped", "alert");
		this.api.status = "stopped";
	}

	/**
	 * Restart the Stellar Engine.
	 *
	 * This execute a stop action and execute the stage2 load actions.
	 */
	async restart() {
		// when Stellar is fully running try stop it first
		if (this.api.status === "running") {
			try {
				await this.stop();
			} catch (error) {
				this.api.log(error, "error");
				throw error;
			}
		}

		try {
			await this.stage2();
		} catch (error) {
			this.api.log(error, "error");
			throw error;
		}

		this.api.log("*** Stellar Restarted ***", "info");
	}

	// --------------------------------------------------------------------------- [States Functions]

	/**
	 * First startup stage.
	 *
	 * Steps:
	 *  - executes the initial satellites;
	 *  - call stage1
	 */
	async stage0() {
		this.api.status = "init_stage0";

		// we need to load the config first
		const initialSatellites = [
			join(import.meta.dirname, "satellites", "utils.js"),
			join(import.meta.dirname, "satellites", "config.js"),
		];

		for (const file of initialSatellites) {
			const filename = file.replace(/^.*[\\\/]/, "");

			// get the initializer
			const initializer = filename.split(".")[0];
			const Satellite = (await import(file)).default;
			this.satellites[initializer] = new Satellite();

			try {
				await this.satellites[initializer].load(this.api);
			} catch (error) {
				this.fatalError(error, "stage0");
			}
		}
	}

	/**
	 * Second startup stage.
	 *
	 * Steps:
	 *  - load all satellites into memory;
	 *  - load satellites;
	 *  - mark Engine like initialized;
	 *  - call stage2.
	 */
	async stage1() {
		// put the status in the next stage
		this.api.status = "init_stage1";

		// ranked object for all stages
		const loadSatellitesRankings = {};
		const startSatellitesRankings = {};
		const stopSatellitesRankings = {};

		// reset satellites arrays
		this.satellites = {};

		// function to load the satellites in the right place
		const loadSatellitesInPlace = async (satellitesFiles) => {
			for (const key in satellitesFiles) {
				const f = satellitesFiles[key];

				// get satellite normalized file name and
				const file = path.normalize(f);
				const initializer = path.basename(f).split(".")[0];

				// get initializer module and instantiate it
				const Satellite = (await import(file)).default;
				this.satellites[initializer] = new Satellite();

				// generate Satellite's load function
				const loadFunction = async () => {
					if (typeof this.satellites[initializer].load !== "function") {
						return;
					}

					this.api.log(` > load: ${initializer}`, "debug");
					await this.satellites[initializer].load(this.api);
					this.api.log(`   loaded: ${initializer}`, "debug");
				};

				// generate Satellite's start function
				const startFunction = async () => {
					if (typeof this.satellites[initializer].start !== "function") {
						return;
					}

					this.api.log(` > start: ${initializer}`, "debug");
					await this.satellites[initializer].start(this.api);
					this.api.log(`   started: ${initializer}`, "debug");
				};

				// generate Satellite's stop function
				const stopFunction = async () => {
					if (typeof this.satellites[initializer].stop !== "function") {
						return;
					}

					this.api.log(` > stop: ${initializer}`, "debug");
					await this.satellites[initializer].stop(this.api);
					this.api.log(`   stopped: ${initializer}`, "debug");
				};

				// normalize satellite priorities
				Engine.normalizeInitializerPriority(this.satellites[initializer]);
				loadSatellitesRankings[this.satellites[initializer].loadPriority] =
					loadSatellitesRankings[this.satellites[initializer].loadPriority] || [];
				startSatellitesRankings[this.satellites[initializer].startPriority] =
					startSatellitesRankings[this.satellites[initializer].startPriority] || [];
				stopSatellitesRankings[this.satellites[initializer].stopPriority] =
					stopSatellitesRankings[this.satellites[initializer].stopPriority] || [];

				// push loader state function to ranked arrays
				loadSatellitesRankings[this.satellites[initializer].loadPriority].push(loadFunction);
				startSatellitesRankings[this.satellites[initializer].startPriority].push(startFunction);
				stopSatellitesRankings[this.satellites[initializer].stopPriority].push(stopFunction);
			}
		};

		// load all the core satellites
		const files = await safeGlob(join(import.meta.dirname, "satellites", "**/*(*.js|*.ts)"));
		const filteredFiles = ensureNoTsHeaderOrSpecFiles(files);
		await loadSatellitesInPlace(filteredFiles);

		// load satellites from all the active modules
		for (const moduleName of this.api.config.modules) {
			const moduleSatellitePath = join(this.api.scope.rootPath, "modules", moduleName, "stellites");

			if (Utils.directoryExists(moduleSatellitePath)) {
				const files = await safeGlob(join(moduleSatellitePath, "**/*(*.js|*.ts)"));
				const filteredFiles = ensureNoTsHeaderOrSpecFiles(files);
				await loadSatellitesInPlace(Utils.getFiles(filteredFiles));
			}
		}

		// organize final array to match the satellites priorities
		this.loadSatellites = Engine.flattenOrderedInitializer(loadSatellitesRankings);
		this.startSatellites = Engine.flattenOrderedInitializer(startSatellitesRankings);
		this.stopSatellites = Engine.flattenOrderedInitializer(stopSatellitesRankings);

		try {
			for (const loadFn of this.loadSatellites) {
				await loadFn();
			}
		} catch (error) {
			this.fatalError(error, "state1");
		}

		await this.stage2();
	}

	/**
	 * Third startup stage.
	 *
	 * Steps:
	 *  - start satellites;
	 *  - mark Engine as running.
	 */
	async stage2() {
		this.api.status = "init_stage2";

		try {
			for (const startFn of this.startSatellites) {
				await startFn();
			}
		} catch (error) {
			this.fatalError(error, "stage2");
		}

		if (startCount === 0) {
			this.api.status = "running";
			this.api.bootTime = new Date().getTime();
			this.api.log(`** Server Started @ ${new Date()} **`, "alert");
		} else {
			this.api.log(`** Server Restarted @ ${new Date()} **`, "alert");
		}

		startCount++;
	}
}
