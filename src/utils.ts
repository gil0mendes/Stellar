import { PathLike } from "node:fs";
import { readFile } from "node:fs/promises";

/**
 * Sleep for the given amount of time.
 *
 * @param time
 * @returns
 */
export function sleep(time: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, time);
	});
}

/**
 * Read contents from a JSON file.
 *
 * @param filePath
 * @returns
 */
export async function fetchJsonFile(filePath: PathLike) {
	const fileContent = await readFile(filePath);
	return JSON.parse(fileContent.toString());
}

export function filterObjectForLogging(params: Record<string, unknown>) {
	// TODO: implement param sanitization and remove sensitive data
	return params;
}
