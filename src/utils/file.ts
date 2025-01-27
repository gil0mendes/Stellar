import { glob, GlobOptions } from "glob";

/**
 * Swap out d.ts files for the JS versions when running with ts-node also filter out *.test. and *.spec. js|ts files
 */
export function ensureNoTsHeaderOrSpecFiles(files: Array<string>): Array<string> {
	return files.filter((f) => {
		if (f.match(/.*\.d\.ts$/)) {
			return false;
		}

		return !f.match(/.*\.(?:spec|test)\.[tj]s$/);
	});
}

/**
 * Get files that match the given glob.
 *
 * @param match
 * @param args
 * @returns
 */
export function safeGlob(match: string, args: GlobOptions = {}) {
	const isWindows = Deno.build.os === "windows";
	return glob(match, { ...args, windowsPathsNoEscape: isWindows });
}
