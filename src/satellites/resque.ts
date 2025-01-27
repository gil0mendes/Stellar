/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { MultiWorker, Queue, Scheduler } from "node-resque";
import { filterObjectForLogging } from "../utils.js";

/**
 * Node-Resque manager.
 */
class ResqueManager {
	/**
	 * API reference object.
	 *
	 * @type {null}
	 */
	api = null;

	/**
	 * Node-resque instance.
	 *
	 * @type {null}
	 */
	queue = null;

	/**
	 * Node-resque multi worker instance.
	 *
	 * @type {null}
	 */
	multiWorker = null;

	/**
	 * Node-resque scheduler instance.
	 *
	 * @type {null}
	 */
	scheduler = null;

	/**
	 * Object with the connection details.
	 *
	 * @type {null}
	 */
	connectionDetails = null;

	/**
	 * Create a new instance of ResqueManager class.
	 *
	 * @param api API reference object.
	 */
	constructor(api) {
		this.api = api;

		// define the connection details, we can use the redis property from the tasks
		this.connectionDetails = {
			redis: api.redis.clients.tasks,
			pkg: ["RedisMock", "_RedisMock"].includes(this.api.redis.clients.tasks?.constructor?.name)
				? "ioredis-mock"
				: "ioredis",
		};
	}

	/**
	 * Start queue.
	 */
	async startQueue() {
		this.queue = new Queue({ connection: this.connectionDetails }, this.api.tasks.jobs);

		this.queue.on("error", (error) => {
			this.api.log(error.toString(), "error", "[api.resque.queue]");
		});

		await this.queue.connect();
	}

	/**
	 * Start the scheduler system.
	 */
	async startScheduler() {
		// check if the scheduler is enabled
		if (this.api.config.tasks.scheduler !== true) {
			return;
		}

		// get the scheduler logger
		this.schedulerLogging = this.api.config.tasks.schedulerLogging;

		this.scheduler = new Scheduler({
			connection: this.connectionDetails,
			timeout: this.api.config.tasks.timeout,
			stuckWorkerTimeout: this.api.config.tasks.stuckWorkerTimeout,
			retryStuckJobs: this.api.config.tasks.retryStuckJobs,
		});

		this.scheduler.on("error", (error) => {
			this.api.log(error.toString(), "error", "[api.resque.scheduler]");
		});

		await this.scheduler.connect();

		// define some handlers to the scheduler events
		this.scheduler.on("start", () => {
			this.api.log("resque scheduler started", this.schedulerLogging.start);
		});
		this.scheduler.on("end", () => {
			this.api.log("resque scheduler ended", this.schedulerLogging.end);
		});
		this.scheduler.on("poll", () => {
			this.api.log("resque scheduler polling", this.schedulerLogging.poll);
		});
		this.scheduler.on("leader", () => {
			this.api.log(`This node is now the Resque scheduler leader`);
		});
		this.scheduler.on("cleanStuckWorker", (workerName, errorPayload, delta) => {
			this.api.log(`cleaned stuck workers`, "warning", { workerName, errorPayload, delta });
		});

		this.scheduler.start();
	}

	/**
	 * Stop scheduler.
	 */
	async stopScheduler() {
		await this.scheduler?.end();
		this.scheduler = null;
	}

	/**
	 * Start multiworker system.
	 */
	async startMultiWorker() {
		this.workerLogging = this.api.config.tasks.workerLogging;
		this.schedulerLogging = this.api.config.tasks.schedulerLogging;

		// create a new multiworker instance
		this.multiWorker = new MultiWorker(
			{
				connection: this.connectionDetails,
				queues: this.api.config.tasks.queues,
				timeout: this.api.config.tasks.timeout,
				checkTimeout: this.api.config.tasks.checkTimeout,
				minTaskProcessors: this.api.config.tasks.minTaskProcessors,
				maxTaskProcessors: this.api.config.tasks.maxTaskProcessors,
				maxEventLoopDelay: this.api.config.tasks.maxEventLoopDelay,
				toDisconnectProcessors: this.api.config.tasks.toDisconnectProcessors,
			},
			this.api.tasks.jobs,
		);

		// normal worker emitters
		this.multiWorker.on("start", (workerId) =>
			this.api.log("[ worker ] started", this.workerLogging.start, {
				workerId,
			}));
		this.multiWorker.on("end", (workerId) =>
			this.api.log("[ worker ]: ended", this.workerLogging.end, {
				workerId,
			}));
		this.multiWorker.on(
			"cleaning_worker",
			(workerId, worker, pid) =>
				this.api.log(`[ worker ]: cleaning old worker ${worker}, (${pid})`, this.workerLogging.cleaning_worker),
		);
		this.multiWorker.on("poll", (workerId, queue) => {
			this.api.log(`[ worker ] polling ${queue}`, this.api.config.tasks.workerLogging.poll, {
				workerId,
			});
		});
		// for debug: this.multiWorker.on('poll', (queue) => this.api.log(`[ worker ]: polling ${queue}`, this.workerLogging.poll))
		this.multiWorker.on(
			"job",
			(workerId, queue, job) =>
				this.api.log(`[ worker ]: working job ${queue}`, this.workerLogging.job, {
					workerId,
					class: job.class,
					queue: job.queue,
					args: JSON.stringify(filterObjectForLogging(job.args[0])),
				}),
		);
		this.multiWorker.on(
			"reEnqueue",
			(workerId, queue, job, plugin) =>
				this.api.log("[ worker ]: reEnqueue job", this.workerLogging.reEnqueue, {
					workerId,
					plugin: JSON.stringify(plugin),
					class: job.class,
					queue: job.queue,
				}),
		);
		this.multiWorker.on("pause", (workerId) =>
			this.api.log("[ worker ]: paused", this.workerLogging.pause, {
				workerId,
			}));

		this.multiWorker.on(
			"failure",
			(workerId, queue, job, failure) => this.api.exceptionHandlers.task(failure, queue, job, workerId),
		);
		this.multiWorker.on("error", (error, workerId, queue, job) => {
			this.api.exceptionHandlers.task(error, queue, job, workerId);
		});

		this.multiWorker.on("success", (workerId, queue, job, result, duration) => {
			const payload = {
				workerId,
				class: job.class,
				queue: job.queue,
				args: JSON.stringify(filterObjectForLogging(job.args[0])),
				result,
				duration,
			};

			this.api.log(`[ worker ]: job success ${queue}`, this.workerLogging.success, payload);
		});

		// multiWorker emitters
		this.multiWorker.on("multiWorkerAction", (verb, delay) => {
			this.api.log(
				`[ multiworker ] checked for worker status: ${verb} (event loop delay: ${delay}ms)`,
				this.api.config.tasks.workerLogging.multiWorkerAction,
			);
		});

		if (this.api.config.tasks.minTaskProcessors > 0) {
			this.multiWorker.start();
		}
	}

	/**
	 * Stop multiworker system.
	 */
	async stopMultiWorker() {
		if (this.api.config.tasks.minTaskProcessors > 0) {
			return this.multiWorker.stop();
		}
	}
}

/**
 * Satellite to start the resque manager.
 */
export default class {
	/**
	 * Satellite load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 600;

	/**
	 * Satellite start priority.
	 *
	 * @type {number}
	 */
	startPriority = 200;

	/**
	 * Satellite stop priority.
	 *
	 * @type {number}
	 */
	stopPriority = 100;

	/**
	 * Satellite load methods.
	 *
	 * @param api   API reference object.
	 */
	load(api) {
		api.resque = new ResqueManager(api);
	}

	/**
	 * Satellite start function.
	 *
	 * @param api   API reference object.
	 */
	async start(api) {
		if (api.config.tasks.minTaskProcessors === 0 && api.config.tasks.maxTaskProcessors > 0) {
			api.config.tasks.minTaskProcessors = 1;
		}

		// start the queue, scheduler and multiworker systems
		await api.resque.startQueue();
		await api.resque.startScheduler();
		await api.resque.startMultiWorker();
	}

	/**
	 * Satellite stop function.
	 *
	 * @param api   API reference object.
	 */
	async stop(api) {
		await api.resque.stopScheduler();
		await api.resque.stopMultiWorker();
		await api.resque.queue.end();
	}
}
