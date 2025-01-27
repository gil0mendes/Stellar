import os from "node:os";
import cluster from "node:cluster";

import { Command } from "../Command.js";
import process from "node:process";

class RunCommand extends Command {
	constructor() {
		super(true);

		this.flags = "run";
		this.desc = "Start a new Stellar instance";

		// set some command vars
		this.state = "stopped";
		this.shutdownTimeout = 1000 * 30;
		this.checkForInternalStopTimer = null;
	}

	buildCommand() {
		const command = super.buildCommand();

		return command
			.option("--prod", "Enable production mode")
			.option("--port <port>", "Port where the server will listening", 8080)
			.option("--clean", "Remove all temporary files and node modules")
			.option("--update", "Update dependencies")
			.option("--cluster", "Run Stellar as a cluster")
			.option("--id <cluster-id>", "Cluster identifier", "stellar-cluster")
			.option("--silent", "No messages will be printed to the console")
			.option("--workers <number>", "Number of workers")
			.option(
				"--workerPrefix <prefix>",
				`Worker's name prefix. If the value is equals to 'hostname' the computer hostname will be used`,
			);
	}

	async exec() {
		// whether the `--cluster` options is defined we stop this command and load the startCluster
		if (this.args.cluster === true) {
			const { handler } = await import("./startCluster.js");
			return handler(this.args);
		}

		// number of ms to wait to do a force shutdown if the Stellar won't stop gracefully
		if (process.env.STELLAR_SHUTDOWN_TIMEOUT) {
			this.shutdownTimeout = parseInt(process.env.STELLAR_SHUTDOWN_TIMEOUT);
		}

		// if the process is a worker we need configure it to communicate with the parent
		if (cluster.isWorker) {
			process.on("message", (msg) => {
				switch (msg) {
					case "start":
						this.startServer();
						break;
					case "stop":
						this.stopServer();
						break;
					// in cluster mode, we cannot re-bind the port, so kill this worker, and
					// then let the cluster start a new one
					case "stopProcess":
					case "restart":
						this.stopProcess();
						break;
				}
			});

			// define action to be performed on an 'uncaughtException' event
			process.on("uncaughtException", (error) => {
				let stack;

				try {
					stack = error.stack.split(os.EOL);
				} catch (e) {
					stack = [error];
				}

				// send the exception to the master
				process.send({
					uncaughtException: {
						message: error.message,
						stack,
					},
				});

				process.nextTick(process.exit);
			});

			// define action to be performed on an 'unhandledRejection' event
			process.on("unhandledRejection", (reason, p) => {
				// send the unhandled error to the master node before end the process
				process.send({ unhandledRejection: { reason, p } });
				process.nextTick(process.exit);
			});
		} else {
			// catch uncaught exception
			process.on("uncaughtException", (error) => {
				console.error(error);
			});

			// catch unhandled rejection
			process.on("unhandledRejection", (error) => {
				console.error(error);
			});
		}

		// defines the action to be performed when a particular event occurs
		process.on("SIGINT", () => this.stopProcess());
		process.on("SIGTERM", () => this.stopProcess());
		process.on("SIGUSR2", () => this.restartServer());

		this.startServer();
	}

	// --------------------------------------------------------------------------- [Actions]

	/**
	 * Start the server execution.
	 */
	async startServer() {
		this._updateServerState("starting");

		// start the engine
		try {
			await this.engine.start();
		} catch (error) {
			this.api.log(error);
			process.exit(1);
		}

		this._updateServerState("started");

		// start check for the engine internal state
		this._checkForInternalStop();

		return this.api;
	}

	/**
	 * Stop server.
	 */
	async stopServer() {
		this._updateServerState("stopping");
		await this.engine.stop();
		this._updateServerState("stopped");
	}

	/**
	 * Restart the server.
	 */
	async restartServer() {
		this._updateServerState("restarting");
		await this.engine.restart();
		this._updateServerState("started");
	}

	// --------------------------------------------------------------------------- [Process]

	/**
	 * Stop the process.
	 */
	async stopProcess() {
		// put a time limit to shutdown the server
		setTimeout(() => process.exit(1), this.shutdownTimeout);

		await this.stopServer();
		process.exit();
	}

	// --------------------------------------------------------------------------- [Helpers]

	/**
	 * Update the server state and notify the master if the current process is a
	 * cluster worker.
	 */
	_updateServerState(newState) {
		this.state = newState;
		if (cluster.isWorker) {
			process.send({ state: this.state });
		}
	}

	/**
	 * Check if the engine stops.
	 */
	_checkForInternalStop() {
		clearTimeout(this.checkForInternalStopTimer);

		// if the engine executing stops finish the process
		if (this.api.status !== "running" && this.status !== "started") {
			process.exit(0);
		}

		this.checkForInternalStopTimer = setTimeout(() => {
			this._checkForInternalStop();
		}, this.shutdownTimeout);
	}
}

export default new RunCommand().buildCommand();
