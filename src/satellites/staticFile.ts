import * as path from "@std/path";
import Mime from "mime";
import { Connection } from "../connection.ts";
import { API } from "../common/types/api.types.ts";
import { assert } from "@std/assert";
import { GetFileResponse, IStaticFile } from "../common/types/static-file.interface.ts";

/**
 * Class to manage the static files.
 */
class StaticFile implements IStaticFile {
	/**
	 * API object reference.
	 */
	api!: API;

	/**
	 * Search locations.
	 *
	 * @type {Array}
	 */
	searchLocations = [];

	/**
	 * Create a new instance of this class.
	 *
	 * @param api API object reference.
	 */
	constructor(api: API) {
		this.api = api;
	}

	/**
	 * Get the public path.
	 *
	 * @param connection  Client connection object.
	 * @param counter
	 */
	searchPath(connection: Connection<unknown>, counter = 0): string | null {
		if (this.searchLocations.length === 0 || counter >= this.searchLocations.length) {
			return null;
		} else {
			return this.searchLocations[counter];
		}
	}

	/**
	 * Get the content of a file by the 'connection.params.file' parameter.
	 *
	 * @param connection  Client connection object.
	 * @param counter
	 */
	async get<C>(connection: Connection<C>, counter = 0): Promise<GetFileResponse<C>> {
		const currentSearchPath = this.searchPath(connection, counter);
		if (!connection.params.file || !currentSearchPath) {
			return this.sendFileNotFound(connection, this.api.config.errors.fileNotProvided(connection));
		}

		const requestedFile = connection.params.file as string | undefined;
		assert(requestedFile, "request file needs to be present");

		const file = !path.isAbsolute(requestedFile)
			? path.normalize(`${currentSearchPath}/${requestedFile}`)
			: requestedFile;

		if (file.indexOf(path.normalize(currentSearchPath)) !== 0) {
			return this.get(connection, counter + 1);
		}

		const [exists, truePath] = await this.checkExistence(file);
		if (!exists) {
			return this.get(connection, counter + 1);
		}

		return this.sendFile(truePath, connection);
	}

	/**
	 * Send a file to the client.
	 *
	 * @param file
	 * @param connection
	 */
	async sendFile<C>(file: string, connection: Connection<C>): Promise<GetFileResponse<C>> {
		try {
			const stats = await Deno.lstat(file);
			const mime = Mime.getType(file);
			const length = stats.size;
			const start = new Date().getTime();
			const lastModified = stats.mtime;

			const fileDescriptor = await Deno.open(file, { read: true });

			return {
				fileDescriptor: {
					file: fileDescriptor,
					lastModified: lastModified as Date,
					// Close the file descriptor after use.
					[Symbol.dispose]: () => {
						fileDescriptor.close();

						const duration = new Date().getTime() - start;
						this.logRequest(file, connection, length, duration, true);
					},
				},
				connection,
				mime,
				length,
			};
		} catch (error) {
			return this.sendFileNotFound(connection, this.api.config.errors.fileReadError(connection, String(error)));
		}
	}

	/**
	 * Send a file not found error to the client.
	 *
	 * @param connection    Client connection object.
	 * @param errorMessage  Error message to send.
	 */
	sendFileNotFound<C>(connection: Connection<C>, errorMessage: string): GetFileResponse<C> {
		connection.error = errorMessage;

		this.logRequest("{404: not found}", connection, null, null, false);

		return {
			connection,
			error: this.api.config.errors.fileNotFound(connection),
			mime: "text/html",
			length: this.api.config.errors.fileNotFound(connection).length,
		};
	}

	/**
	 * Check the existence of a file.
	 *
	 * @param file
	 */
	async checkExistence(file: string): Promise<[boolean, string]> {
		try {
			const stats = await Deno.lstat(file);

			if (stats.isDirectory) {
				const indexPath = `${file}/${this.api.config.general.directoryFileType}`;
				return this.checkExistence(indexPath);
			}

			if (stats.isSymlink) {
				const truePath = await Deno.readLink(file);
				return this.checkExistence(truePath);
			}

			return [stats.isFile, file];
		} catch (err) {
			if (!(err instanceof Deno.errors.NotFound)) {
				throw err;
			}

			return [false, file];
		}
	}

	/**
	 * Log file requests.
	 *
	 * @param file
	 * @param connection
	 * @param length
	 * @param duration
	 * @param success
	 */
	logRequest(file: string, connection: Connection<unknown>, length: number, duration: number, success: boolean) {
		this.api.log(`[ file @ ${connection.type}]`, "debug", {
			to: connection.remoteHostname,
			file: file,
			size: length,
			duration: duration,
			success: success,
		});
	}
}

export default class {
	/**
	 * Satellite load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 510;

	/**
	 * Satellite load function.
	 *
	 * @param api   API reference object.
	 */
	async load(api: API) {
		// put static file methods available on the API object
		api.staticFile = new StaticFile(api);

		// load in the explicit public paths first
		if (api.config.general.paths !== undefined) {
			api.staticFile.searchLocations.push(path.normalize(api.config.general.paths.public));
		}
	}
}
