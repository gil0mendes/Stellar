import { mkdir } from "node:fs/promises";
import winston from "winston";

export default class {
	loadPriority = 120;

	async createLogsFolder(api) {
		const logsDir = api.config.general.paths.log;
		await mkdir(logsDir, {
			mode: 0o777,
			recursive: true,
		});
	}

	async load(api) {
		// try to create the logs folder
		try {
			await this.createLogsFolder(api);
		} catch (e) {
			api.log(`Unable to create the logs directory(${api.config.general.paths.log})`, "emerg", e);
			return api.commands.stop();
		}

		const loggers = (api.config.logger.loggers || []).map((logger) =>
			typeof logger === "function" ? logger(api, winston) : logger
		);

		// create the logger instance
		api.logger = new winston.createLogger({
			transports: loggers,
			levels: api.config.logger.levels ?? winston.config.syslog.levels,
		});

		// define log colors
		if (api.config.logger.colors) {
			winston.addColors(api.config.logger.colors);
		}

		// replace the basic core log function with winston
		api.log = (msg, level = "info", ...extra) => {
			let args = [level, msg, ...extra];
			api.logger.log(...args);
		};

		const logLevels = Object.keys(api.logger.levels);
		api.log("*** starting Stellar ***", "notice");
		api.log("Logger loaded. Possible levels include: ", "debug", logLevels);
	}
}
