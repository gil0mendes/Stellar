class ExceptionsManager {
	/**
	 * API reference.
	 *
	 * @type {null}
	 */
	api = null;

	/**
	 * Array with the exceptions reporters.
	 *
	 * @type {Array}
	 */
	reporters = [];

	constructor(api) {
		this.api = api;

		this.reporters.push(this.consoleReporter.bind(this));
	}

	consoleReporter(error, type, name, objects, severity) {
		let output = "";
		let extraMessages = [];
		const data = error["data"] ?? {};

		if (type === "uncaught") {
			extraMessages.push(`Uncaught ${name}`);
		} else if (type === "loader") {
			extraMessages.push(`Failed to load ${objects.fullFilePath}\n`);
		} else if (type === "action") {
			extraMessages.push(`Uncaught error from action: ${name}\n`);

			extraMessages.push("Connection details:");
			const relevantDetails = ["action", "remoteIP", "type", "params", "room"];
			for (let detailName of relevantDetails) {
				if (
					objects.connection[detailName] !== null &&
					objects.connection[detailName] !== undefined &&
					typeof objects.connection[detailName] !== "function"
				) {
					extraMessages.push(
						`    ${detailName}: ${JSON.stringify(objects.connection[detailName])}`,
					);
				}
			}

			// push an empty element to create a empty line
			extraMessages.push("");
		} else if (type === "task") {
			extraMessages.push(`Error from Task`);
			data.name = name;
			data.queue = objects.queue;
			data.worker = objects.workerId;
			data.arguments = objects?.task?.args ? JSON.stringify(objects.task.args[0]) : undefined;
		} else {
			extraMessages.push(`Error: ${error.message}\n`);
			extraMessages.push(`    Type: ${type}`);
			extraMessages.push(`    Name: ${name}`);
			extraMessages.push(`    Data: ${JSON.stringify(objects)}`);
		}

		// reduce the extra messages into a single string
		output += extraMessages.reduce((prev, item) => `${prev}${item} \n`, "");

		// when there is a stack trace try to add it to the data object
		if (error.stack) {
			data.stack = error.stack;
		} else {
			data.stack = error.message ?? error.toString();
		}

		// print out the output message
		try {
			if (output) {
				this.api.log(output, severity, data);
			}
		} catch (e) {
			console.log(message, data);
		}
	}

	/**
	 * Execute reporters.
	 *
	 * @param err
	 * @param type
	 * @param name
	 * @param objects
	 * @param severity
	 */
	report(err, type, name, objects, severity = "error") {
		for (const reporter of this.reporters) {
			reporter(err, type, name, objects, severity);
		}
	}

	/**
	 * Loader exception.
	 *
	 * @param fullFilePath
	 * @param err
	 */
	loader(fullFilePath, err) {
		let name = `loader ${fullFilePath}`;
		this.report(err, "loader", name, { fullFilePath: fullFilePath }, "alert");
	}

	/**
	 * Handler for action exceptions.
	 *
	 * @param error
	 * @param data
	 */
	action(error, data) {
		this.report(
			error,
			"action",
			`action: ${data.action.name}`,
			{ ...data, error },
			"alert",
		);
	}

	/**
	 * Exception handler for tasks.
	 *
	 * @param error       Error object.
	 * @param queue       Queue here the error occurs
	 * @param task
	 * @param workerId
	 */
	task(error, queue, task, workerId) {
		let simpleName;

		try {
			simpleName = task["class"];
		} catch (e) {
			simpleName = error.message;
		}

		this.api.exceptionHandlers.report(
			error,
			"task",
			`task:${simpleName}`,
			{
				task,
				queue,
				workerId,
			},
			this.api.config.tasks.workerLogging.failure,
		);
	}
}

/**
 * Satellite definition.
 */
export default class {
	/**
	 * Satellite load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 130;

	/**
	 * Satellite load function.
	 *
	 * @param api     API reference
	 */
	async load(api) {
		api.exceptionHandlers = new ExceptionsManager(api);
	}
}
