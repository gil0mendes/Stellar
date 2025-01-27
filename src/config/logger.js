import winston from "winston";
import "winston-daily-rotate-file";
import cluster from "node:cluster";
import chalk from "chalk";

const level = Deno.env.get("LOG_LEVEL") ?? "info";

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

/**
 * Serialize additional log information.
 *
 * @param info Information to be serialized.
 * @returns
 */
function extraPropsSerializer(info) {
	const propsToIgnore = ["message", "timestamp", "level"];

	return Object.keys(info).reduce((response, entryKey) => {
		if (propsToIgnore.includes(entryKey)) {
			return response;
		}

		const value = info[entryKey];
		if (value === undefined || value === null || value === "") {
			return response;
		}

		return `${response} ${entryKey}=${value}`;
	}, "");
}

function buildColorizeFormat() {
	return new (class Colorize {
		transform(info) {
			// format log level
			if (info.level) {
				info.level = chalk[`bg${colors[info.level]}`].black(` ${info.level.toUpperCase()} `);
			}

			// format timestamp
			if (info.timestamp) {
				info.timestamp = chalk.bgWhite.black(info.timestamp);
			}

			return info;
		}
	})();
}

/**
 * Build Console logger.
 *
 * @returns
 */
function buildConsoleLogger(level = "info") {
	return winston.createLogger({
		format: winston.format.combine(
			winston.format.timestamp(),
			buildColorizeFormat(),
			winston.format.printf((info) => `${info.timestamp} - ${info.level} ${info.message}${extraPropsSerializer(info)}`),
		),
		level,
		levels: winston.config.syslog.levels,
		transports: [new winston.transports.Console()],
	});
}

function buildFileLogger(api, level = "info") {
	const logsDir = api.config.general.paths.log;

	return winston.createLogger({
		level,
		levels: winston.config.syslog.levels,
		transports: [
			new winston.transports.DailyRotateFile({
				filename: `${logsDir}/${api.pids.title}.log`,
				datePattern: "yyyy-MM-dd.",
				level: "info",
			}),
		],
	});
}

export default {
	logger(api) {
		const loggers = [];

		// check if this Stellar instance is the primary node
		if (cluster.isPrimary) {
			loggers.push(() => buildConsoleLogger(level));
		}

		// add a file logger
		loggers.push(() => buildFileLogger(api));

		return {
			loggers,
			maxLogStringLength: 100,
		};
	},
};

export const test = {
	logger() {
		return {
			loggers: [buildConsoleLogger("emerg")],
		};
	},
};
