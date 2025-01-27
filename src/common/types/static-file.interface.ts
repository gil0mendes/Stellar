import { Connection } from "../../connection.ts";
import { ErrorBody } from "./errors.types.ts";

export type FileDescriptor = {
	/**
	 * File.
	 */
	file: Deno.FsFile;

	/**
	 * Last time that the file was modified.
	 */
	lastModified: Date;

	[Symbol.dispose]: () => void;
};

/**
 * Disposable file that automatically closes when using the `using` keyword.
 */
export type GetFileResponse<C> = {
	/**
	 * Connection that requested the file.
	 */
	connection: Connection<C>;

	/**
	 * File mime-type.
	 */
	mime: string;

	/**
	 * File length;
	 */
	length: number;

	/**
	 * When the file was not found.
	 */
	error?: ErrorBody;

	/**
	 * File descriptor for when the file exists.
	 *
	 * This oject support `using` system to dispose the file when it goes out of scope.
	 */
	fileDescriptor?: FileDescriptor;
};

export interface IStaticFile {
	/**
	 * Get a static file.
	 *
	 * @param connection
	 * @param counter
	 */
	get<C>(connection: Connection<C>, counter?: number): Promise<GetFileResponse<C>>;
}
