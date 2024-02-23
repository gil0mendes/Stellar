import path from "path";
import async from "async";
import { Utils as UtilsClass } from "./satellites/utils.js";

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
		let keys = [];
		let output = [];

		// get keys from the collection
		for (var key in collection) {
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
	 * @private
	 * @param api     API instance.
	 * @param errors  String or array with the fatal error(s).
	 * @param type    String with the error type.
	 */
	static fatalError(api, errors, type) {
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
		api.log(`Error with satellite step: ${type}`, "emerg");

		// log all the errors
		errors.forEach((err) => api.log(err, "emerg"));

		// finish the process execution
		api.commands.stop.call(api, () => {
			process.exit(1);
		});
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

	initialize(callback = null) {
		// print current execution path
		this.api.log(`Current universe "${this.api.scope.rootPath}"`, "info");

		// execute the stage 0
		this.stage0(callback);
	}

	/**
	 * Start engine execution.
	 *
	 * @param callback This function is called when the Engine finish their startup.
	 */
	start(callback = null) {
		// reset start counter
		startCount = 0;

		// check if the engine was already initialized
		if (this.api.status !== "init_stage0") {
			return this.initialize((error, api) => {
				// if an error occurs we stop here
				if (error) {
					return callback(error, api);
				}

				// start stage1 loading method
				this.stage1(callback);
			});
		}

		// start stage1 loading method
		return this.stage1(callback);
	}

	/**
	 * Stop the Engine execution.
	 *
	 * This method try shutdown the engine in a non violent way, this
	 * starts to execute all the stop method on the supported satellites.
	 *
	 * @param callback Callback function to be executed at the stop end execution.
	 */
	stop(callback = null) {
		if (this.api.status === "running") {
			// stop Engine
			this.api.status = "shutting_down";

			// log a shutting down message
			this.api.log("Shutting down open servers and stopping task processing", "alert");

			// if this is the second shutdown we need remove the `finalStopInitializer` callback
			if (this.stopSatellites[this.stopSatellites.length - 1].name === "finalStopInitializer") {
				this.stopSatellites.pop();
			}

			// add the final callback
			this.stopSatellites.push((next) => {
				// stop watch for file changes
				this.api.configs.unwatchAllFiles();

				// clear cluster PIDs
				this.api.pids.clearPidFile();

				// log a shutdown message
				this.api.log("Stellar has been stopped", "alert");
				this.api.log("***", "debug");

				// mark server as stopped
				this.api.status = "stopped";

				// execute the callback on the next tick
				process.nextTick(() => {
					if (callback !== null) {
						callback(null, this.api);
					}
				});

				// async callback
				next();
			});

			// iterate all satellites and stop them
			async.series(this.stopSatellites, (errors) => Engine.fatalError(this.api, errors, "stop"));
		} else if (this.api.status === "shutting_down") {
			// double sigterm; ignore it
		} else {
			// we can shutdown the Engine if it is not running
			this.api.log("Cannot shutdown Stellar, not running", "error");

			// exists a callback?
			if (callback !== null) {
				callback(null, this.api);
			}
		}
	}

	/**
	 * Restart the Stellar Engine.
	 *
	 * This execute a stop action and execute the stage2 load actions.
	 *
	 * @param callback Callback function to be executed at the restart end.s
	 */
	restart(callback = null) {
		if (this.api.status === "running") {
			// stop the engine
			this.stop((err) => {
				// log error if present
				if (err) {
					this.api.log(err, "error");
				}

				// start the engine again
				this.stage2(function (err) {
					if (err) {
						this.api.log(err, "error");
					}

					// log a restart message
					this.api.log("*** Stellar Restarted ***", "info");

					// exists a callback
					if (callback !== null) {
						callback(null, this.api);
					}
				});
			});
		} else {
			this.stage2((err) => {
				// log any encountered error
				if (err) {
					this.api.log(err, "error");
				}

				// log a restart message
				this.api.log("*** Stellar Restarted ***", "info");

				// exists a callback
				if (callback !== null) {
					callback(null, this.api);
				}
			});
		}
	}

	// --------------------------------------------------------------------------- [States Functions]

	/**
	 * First startup stage.
	 *
	 * Steps:
	 *  - executes the initial satellites;
	 *  - call stage1
	 *
	 * @param callback This callback only are executed at the end of stage2.
	 */
	async stage0(callback = null) {
		// set the state
		this.api.status = "init_stage0";

		// we need to load the config first
		let initialSatellites = [
			path.resolve(`${import.meta.dirname}/satellites/utils.js`),
			path.resolve(`${import.meta.dirname}/satellites/config.js`),
		];

		for (const file of initialSatellites) {
			// get full file name
			let filename = file.replace(/^.*[\\\/]/, "");

			// get the first part of the file name
			let initializer = filename.split(".")[0];

			// get the initializer
			const Satellite = (await import(file)).default;
			this.satellites[initializer] = new Satellite();

			// add it to array
			this.initialSatellites.push((next) => this.satellites[initializer].load(this.api, next));
		}

		// execute stage0 satellites in series
		async.series(this.initialSatellites, (error) => {
			callback(error, this.api);

			if (error) {
				Engine.fatalError(this.api, error, "stage0");
			}
		});
	}

	/**
	 * Second startup stage.
	 *
	 * Steps:
	 *  - load all satellites into memory;
	 *  - load satellites;
	 *  - mark Engine like initialized;
	 *  - call stage2.
	 *
	 * @param callback This callback only is executed at the stage2 end.
	 */
	async stage1(callback = null) {
		// put the status in the next stage
		this.api.status = "init_stage1";

		// ranked object for all stages
		let loadSatellitesRankings = {};
		let startSatellitesRankings = {};
		let stopSatellitesRankings = {};

		// reset satellites arrays
		this.satellites = {};

		// function to load the satellites in the right place
		let loadSatellitesInPlace = async (satellitesFiles) => {
			// iterate all files
			for (let key in satellitesFiles) {
				let f = satellitesFiles[key];

				// get satellite normalized file name and
				let file = path.normalize(f);
				let initializer = path.basename(f).split(".")[0];
				let ext = file.split(".").pop();

				// only load files with the `.js` extension
				if (ext !== "js") {
					continue;
				}

				// get initializer module and instantiate it
				const Satellite = (await import(file)).default;
				this.satellites[initializer] = new Satellite();

				// initializer load function
				let loadFunction = (next) => {
					// check if the initializer have a load function
					if (typeof this.satellites[initializer].load === "function") {
						this.api.log(` > load: ${initializer}`, "debug");

						// call `load` property
						this.satellites[initializer].load(this.api, (err) => {
							if (!err) {
								this.api.log(`   loaded: ${initializer}`, "debug");
							}
							next(err);
						});
					} else {
						next();
					}
				};

				// initializer start function
				let startFunction = (next) => {
					// check if the initializer have a start function
					if (typeof this.satellites[initializer].start === "function") {
						this.api.log(` > start: ${initializer}`, "debug");

						// execute start routine
						this.satellites[initializer].start(this.api, (err) => {
							if (!err) {
								this.api.log(`   started: ${initializer}`, "debug");
							}
							next(err);
						});
					} else {
						next();
					}
				};

				// initializer stop function
				let stopFunction = (next) => {
					if (typeof this.satellites[initializer].stop === "function") {
						this.api.log(` > stop: ${initializer}`, "debug");

						this.satellites[initializer].stop(this.api, (err) => {
							if (!err) {
								this.api.log(`   stopped: ${initializer}`, "debug");
							}
							next(err);
						});
					} else {
						next();
					}
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

		// get an array with all satellites
		await loadSatellitesInPlace(Utils.getFiles(`${import.meta.dirname}/satellites`));

		// load satellites from all the active modules
		for (const moduleName of this.api.config.modules) {
			let moduleSatellitePaths = `${this.api.scope.rootPath}/modules/${moduleName}/satellites`;

			if (Utils.directoryExists(moduleSatellitePaths)) {
				await loadSatellitesInPlace(Utils.getFiles(moduleSatellitePaths));
			}
		}

		// organize final array to match the satellites priorities
		this.loadSatellites = Engine.flattenOrderedInitializer(loadSatellitesRankings);
		this.startSatellites = Engine.flattenOrderedInitializer(startSatellitesRankings);
		this.stopSatellites = Engine.flattenOrderedInitializer(stopSatellitesRankings);

		// on the end of loading all satellites set engine like initialized
		this.loadSatellites.push(() => {
			this.stage2(callback);
		});

		// start initialization process
		async.series(this.loadSatellites, (errors) => Engine.fatalError(this.api, errors, "stage1"));
	}

	/**
	 * Third startup stage.
	 *
	 * Steps:
	 *  - start satellites;
	 *  - mark Engine as running.
	 *
	 *  @param callback
	 */
	stage2(callback = null) {
		// put the engine in the stage2 state
		this.api.status = "init_stage2";

		if (startCount === 0) {
			this.startSatellites.push((next) => {
				// set the state
				this.api.status = "running";

				this.api.bootTime = new Date().getTime();
				if (startCount === 0) {
					this.api.log(`** Server Started @ ${new Date()} ***`, "alert");
				} else {
					this.api.log(`** Server Restarted @ ${new Date()} ***`, "alert");
				}

				// increment the number of starts
				startCount++;

				// call the callback if it's present
				if (callback !== null) {
					callback(null, this.api);
				}

				next();
			});
		}

		// start all initializers
		async.series(this.startSatellites, (err) => Engine.fatalError(this.api, err, "stage2"));
	}
}
