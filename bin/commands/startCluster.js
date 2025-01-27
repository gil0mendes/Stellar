import async from "async";
import cluster from "node:cluster";
import fs from "node:fs/promises";
import isRunning from "is-running";
import os from "node:os";
import path from "node:path";
import winston from "winston";

import { Command } from "../Command.js";

/**
 * This class represent a cluster Worker.
 */
class Worker {
	/**
	 * Constructor.
	 *
	 * @param parent  Parent worker.
	 * @param id      Worker identifier.
	 * @param env     Environment.
	 */
	constructor(parent, id, env) {
		this.state = null;
		this.id = id;
		this.env = env;
		this.parent = parent;
	}

	/**
	 * Define the log prefix for this worker.
	 *
	 * @returns {string}
	 */
	logPrefix() {
		let s = "";

		s += `[worker #${this.id}`;

		if (this.worker && this.worker.process) {
			s += ` (${this.worker.process.pid})]: `;
		} else {
			s += "]: ";
		}

		return s;
	}

	/**
	 * Start the worker execution.
	 */
	start() {
		// create the worker
		this.worker = cluster.fork(this.env);

		// define the exit action
		this.worker.on("exit", () => {
			this.parent.log(`${this.logPrefix()} exited`, "info");

			// remove worker
			for (let i in this.parent.workers) {
				if (this.parent.workers[i].id === this.id) {
					this.parent.workers.splice(i, 1);
					break;
				}
			}

			this.parent.work();
		});

		// some early exception are not catch
		this.worker.process.stderr.on("data", (chunk) => {
			// get message
			let message = String(chunk);

			this.parent.log(`uncaught exception => ${message}`, "alert");
			this.parent.flapCount++;
		});

		this.worker.on("message", (message) => {
			// update the worker state if it exists in the message
			if (message.state) {
				this.state = message.state;
				this.parent.log(`${this.logPrefix()}  ${message.state}`, "info");
			}

			// is a 'uncaughtException'
			if (message.uncaughtException) {
				this.parent.log(`uncaught exception => ${message.uncaughtException.message}`, "alert");
				message.uncaughtException.state.forEach((line) => this.parent.log(`${this.logPrefix()}   ${line}`, "alert"));
				this.parent.flapCount++;
			}

			// if is a 'unhandledRejection'
			if (message.unhandledRejection) {
				this.parent.log(`unhandled rejection => ${JSON.stringify(message.unhandledRejection)}`, "alert");
				this.parent.flapCount++;
			}

			this.parent.work();
		});
	}

	/**
	 * Stop the worker execution.
	 */
	stop() {
		this.worker.send("stopProcess");
	}

	/** */
	restart() {
		this.worker.send("restart");
	}
}

// ----------------------------------------------------------------------------- [Cluster Manager Class]

/**
 * Cluster manager class.
 */
class ClusterManager {
	/**
	 * Class constructor.
	 *
	 * @param args Options
	 */
	constructor(args) {
		// class variables
		this.workers = [];
		this.workersToRestart = [];
		this.flapCount = 0;

		// get default options
		this.options = ClusterManager.defaults();

		// subscribe default options
		for (let i in this.options) {
			if (args[i] !== null && args[i] !== undefined) {
				this.options[i] = args[i];
			}
		}

		// config the logger
		let transports = [];

		// add a file logger by default
		transports.push(
			new winston.transports.File({
				filename: `${this.options.logPath}/${this.options.logFile}`,
			}),
		);

		// if this is the master process add a console transport
		if (cluster.isMaster && args.silent !== true) {
			transports.push(
				new winston.transports.Console({
					colorize: true,
					timestamp: () => `${this.options.id} @ ${new Date().toISOString()}`,
				}),
			);
		}

		// init the logger
		this.logger = new winston.Logger({
			levels: winston.config.syslog.levels,
			transports: transports,
		});
	}

	/**
	 * This method create a new directory if that not exists.
	 *
	 * @param path      Path to the directory to be created.
	 * @param callback  Callback function.
	 */
	static configurePath(path, callback) {
		// make the 'logs' folder if not exists
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path);
		}

		// executes the callback function
		callback();
	}

	/**
	 * Log a message.
	 *
	 * @param message   Message to be logged.
	 * @param severity  Severity of the message.
	 */
	log(message, severity) {
		this.logger.log(severity, message);
	}

	/**
	 * Return the cluster default options.
	 *
	 * @returns {{stopTimeout: number, expectedWorkers: *, flapWindow: number, execPath: String, pidPath: string, logPath: string, workerTitlePrefix: string, args: string, buildEnv: null}}
	 */
	static defaults() {
		return {
			id: "StellarCluster",
			stopTimeout: 1000,
			expectedWorkers: os.cpus().length,
			flapWindow: 1000 * 30,
			execPath: __filename,
			tempPath: `${process.cwd()}/temp`,
			pidPath: `${process.cwd()}/temp/pids`,
			pidFile: "cluster_pidfile",
			logPath: `${process.cwd()}/temp/logs`,
			logFile: "cluster.log",
			workerTitlePrefix: "stellar-worker-",
			args: "",
			buildEnv: null,
		};
	}

	/**
	 * Build worker environment.
	 *
	 * @param workerId  Worker identifier.
	 * @returns {*}     Hash with the environment options.
	 */
	buildEnv(workerId) {
		if (typeof this.options.buildEnv === "function") {
			return this.options.buildEnv.call(this, workerId);
		} else {
			return {
				title: this.options.workerTitlePrefix + workerId,
			};
		}
	}

	/**
	 * Write the process pid on the file.
	 *
	 * @param callback  Callback function.
	 */
	writePidFile(callback) {
		// build the pid file path
		let file = `${this.options.pidPath}/${this.options.pidFile}`;

		// if exists throw an error. We can not have two instances of the same project
		if (fs.existsSync(file)) {
			// get the old pid saved on the pids file
			let oldPid = parseInt(fs.readFileSync(file));

			if (isRunning(oldPid)) {
				return callback(new Error(`Stellar already running (pid ${oldPid})`));
			}
		}

		// write the new process pid
		fs.writeFileSync(file, process.pid);

		// executes the callback on the next tick
		process.nextTick(callback);
	}

	/**
	 * Start the cluster manager.
	 *
	 * @param callback  Callback function.
	 */
	start(callback) {
		let jobs = [];

		// log the options
		this.log(JSON.stringify(this.options), "debug");

		// configure the master
		cluster.setupMaster({
			exec: this.options.execPath,
			args: this.options.args.split(" "),
			silent: true,
		});

		// set 'SIGINT' event
		process.on("SIGINT", () => {
			this.log("Signal: SIGINT", "info");
			this.stop(process.exit);
		});

		// set 'SIGTERM' event
		process.on("SIGTERM", () => {
			this.log("Signal: SIGTERM", "info");
			this.stop(process.exit);
		});

		// set 'SIGUSR2' event
		process.on("SIGUSR2", () => {
			this.log("Signal: SIGUSR2", "info");
			this.log("swap out new workers one-by-one", "info");
			this.workers.forEach((worker) => this.workersToRestart.push(worker.id));
			this.work();
		});

		// set 'SIGHUP' event
		process.on("SIGHUP", () => {
			this.log("Signal: SIGHUP", "info");
			this.log("reload all workers now", "info");
			this.workers.forEach((worker) => worker.restart());
		});

		// set 'SIGTTIN' event
		process.on("SIGTTIN", () => {
			this.log("Signal: SIGTTIN", "info");
			this.log("add a worker", "info");
			this.options.expectedWorkers++;
			this.work();
		});

		// set 'SIGTTOU' event
		process.on("SIGTTOU", () => {
			this.log("Signal: SIGTTOU", "info");
			this.log("remove a worker", "info");
			this.options.expectedWorkers--;
			this.work();
		});

		// push the initial job to the queue. This will print out a welcome message.
		jobs.push((done) => {
			this.log("--- Starting Cluster ---", "notice");
			this.log(`pid: ${process.pid}`, "notice");
			process.nextTick(done);
		});

		jobs.push((done) => {
			if (this.flapTimer) {
				clearInterval(this.flapTimer);
			}

			this.flapTimer = setInterval(() => {
				if (this.flapCount > this.options.expectedWorkers * 2) {
					this.log(
						`CLUSTER IS FLAPPING (${this.flapCount} crashes in ${this.options.flapWindow} ms). Stopping`,
						"emerg",
					);
					this.stop(process.exit);
				} else {
					this.flapCount = 0;
				}
			}, this.options.flapWindow);

			// finish the job execution
			done();
		});

		// config some folders
		jobs.push((done) => {
			ClusterManager.configurePath(this.options.tempPath, done);
		});
		jobs.push((done) => {
			ClusterManager.configurePath(this.options.logPath, done);
		});
		jobs.push((done) => {
			ClusterManager.configurePath(this.options.pidPath, done);
		});

		// write workers pids
		jobs.push((done) => {
			this.writePidFile(done);
		});

		// execute the queued jobs
		async.series(jobs, (error) => {
			if (error) {
				this.log(error, "error");
				process.exit(1);
			} else {
				this.work();
				if (typeof callback === "function") {
					callback();
				}
			}
		});
	}

	/**
	 * Stop the cluster.
	 *
	 * @param callback Function to be executed at the end.
	 */
	stop(callback) {
		// execute the callback when the number of works goes to zero
		if (this.workers.length === 0) {
			this.log("all workers stopped", "notice");
			callback();
		} else {
			this.log(`${this.workers.length} workers running, waiting on stop`, "info");
			setTimeout(() => {
				this.stop(callback);
			}, this.options.stopTimeout);
		}

		// prevent the creation of new workers
		if (this.options.expectedWorkers > 0) {
			this.options.expectedWorkers = 0;
			this.work();
		}
	}

	/**
	 * Sort the workers.
	 */
	sortWorkers() {
		this.workers.sort((a, b) => a.id - b.id);
	}

	/**
	 * Check work to be done.
	 */
	work() {
		let self = this;
		let worker;
		let workerId;

		// sort the workers
		this.sortWorkers();

		let stateCounts = {};

		// group workers by their state
		this.workers.forEach((worker) => {
			if (!stateCounts[worker.state]) {
				stateCounts[worker.state] = 0;
			}
			stateCounts[worker.state]++;
		});

		// if the state changes log a message
		if (
			this.options.expectedWorkers < this.workers.length &&
			!stateCounts.stopping &&
			!stateCounts.stopped &&
			!stateCounts.restarting
		) {
			worker = this.workers[this.workers.length - 1];
			this.log(`signaling worker #${worker.id} to stop`, "info");
			worker.stop();
		} else if (this.options.expectedWorkers > this.workers.length && !stateCounts.starting && !stateCounts.restarting) {
			workerId = 1;
			this.workers.forEach((worker) => {
				if (worker.id === workerId) {
					workerId++;
				}
			});

			this.log(`starting worker #${workerId}`, "info");

			// build the environment for the new worker who will be created
			var env = this.buildEnv(workerId);

			// create a new worker
			worker = new Worker(self, workerId, env);

			// start the worker
			worker.start();

			// push the worker to the list of workers
			this.workers.push(worker);
		} else if (
			this.workersToRestart.length > 0 &&
			!stateCounts.starting &&
			!stateCounts.stopping &&
			!stateCounts.stopped &&
			!stateCounts.restarting
		) {
			workerId = this.workersToRestart.pop();
			this.workers.forEach((worker) => {
				if (worker.id === workerId) {
					worker.stop();
				}
			});
		} else {
			if (stateCounts.started === this.workers.length) {
				this.log(`cluster equilibrium state reached with ${this.workers.length} workers`, "notice");
			}
		}
	}
}

// ----------------------------------------------------------------------------- [Command]

class RunClusterCommand extends Command {
	constructor() {
		super();
	}

	exec() {
		// create the options object to pass to the cluster manager
		let options = {
			execPath: path.normalize(`${import.meta.dirname}/../stellar`),
			args: "run",
			silent: this.args.silent,
			expectedWorkers: this.args.workers,
			id: this.args.id,
			buildEnv: (workerId) => {
				let env = {};

				// configure the environment variables
				for (let k in process.env) {
					env[k] = process.env[k];
				}

				// get the worker prefix
				let title = this.args.workerPrefix;

				// configure a default worker name in the case of the user give us an
				// empty parameter
				if (!title || title === "") {
					title = "stellar-worker-";
				} else if (title === "hostname") {
					title = `${os.hostname()}-`;
				}

				// attach worker id
				title += workerId;
				env.title = title;
				env.STELLAR_TITLE = title;

				return env;
			},
		};

		// create a new cluster manager
		const manager = new ClusterManager(options);

		// start cluster
		manager.start();

		return true;
	}
}

export default new RunClusterCommand();
