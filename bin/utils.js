import fs, {
	access,
	mkdir,
	readdir,
	readFile,
	rmdir,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

/**
 * Get the current universe.
 *
 * @returns {*|String}
 */
export function getCurrentUniverse() {
	return process.cwd();
}

/**
 * read the manifest.json file to get the active modules and return them.
 */
export async function getAppModules() {
	const manifest = await readFile(`${getCurrentUniverse()}/manifest.json`);
	return JSON.parse(manifest).modules || [];
}

/**
 * Check if a file/folder exists.
 *
 * @param path
 * @returns {boolean}
 */
export async function exists(path) {
	try {
		await access(path, fs.F_OK);
		return true;
	} catch (_e) {
		// do nothing
	}

	return false;
}

/**
 * Create a folder if not exists.
 *
 * @param path Path to check.
 */
export async function createFolderIfNotExists(path) {
	if (!(await exists(path))) {
		await createFolder(path);
	}
}

/**
 * Remove a directory.
 *
 * @param path   Directory path.
 */
export async function removeDirectory(path) {
	let filesList;

	// get directory files
	try {
		filesList = await readdir(path);
	} catch (e) {
		return;
	}

	// iterate all folders and files on the directory
	for (const file of filesList) {
		// get full file path
		let filePath = `${path}/${file}`;

		// check if it's a file
		if ((await stat(filePath)).isFile()) {
			await unlink(filePath);
		} else {
			await removeDirectory(filePath);
		}
	}

	// remove current directory
	await rmdir(path);
}

/**
 * Remove the object pointed by the path (file/directory).
 *
 * This function checks if the path exists before try remove him.
 *
 * @param path  Path to be removed.
 */
export async function removePath(path) {
	// if the path don't exists return
	if (!(await exists(path))) {
		return;
	}

	// if the path is a file remote it and return
	if ((await stat(path)).isFile()) {
		return await unlink(path);
	}

	// remove all the directory content
	await removeDirectory(path);
}

/**
 * Check if the module exists in the current universe.
 *
 * @param moduleName
 * @returns {boolean}
 */
export function moduleExists(moduleName) {
	return exists(`${getCurrentUniverse()}/modules/${moduleName}`);
}

/**
 * Create a file and write some content that file.
 *
 * @param path      Path where the file must be created.
 * @param content   Content to be written.
 * @returns {*}
 */
export async function createFile(path, content) {
	return writeFile(path, content, "utf8");
}

/**
 * Get the template file content.
 *
 * @param name    Template name to get.
 * @returns {*}
 */
export async function getTemplate(name) {
	return import(`${import.meta.dirname}/templates/${name}`);
}

/**
 * Check if a folder is empty.
 *
 * @param path        Path of the folder to be validated.
 * @returns {boolean} True if the folder is empty, false otherwise.
 */
export async function folderIsEmpty(path) {
	let list = await readdir(path);
	list = list.filter((item) => !/(^|\/)\.[^\/\.]/g.test(item));

	return list.length <= 0;
}

/**
 * Create a new directory.
 *
 * @param path
 */
export async function createFolder(path) {
	try {
		await mkdir(path);
	} catch (e) {
		if (e.code !== "EEXIST") {
			throw e;
		}
	}
}

/**
 * Build a file using a template.
 *
 * This uses the string literals to build the template. The `templateName`
 * must be present on the template folder.
 *
 * @param templateName  Template name
 * @param data          Data to use in the template
 * @param outputPath    Output file path
 */
export async function generateFileFromTemplate(templateName, data, outputPath) {
	const templateModule = await getTemplate(templateName);
	const generatedContent = templateModule.render(data);
	await createFile(outputPath, generatedContent);
}

/**
 * Get stellar package json contents.
 *
 * @returns
 */
export async function getStellarMetadata() {
	const stellarPackageMetadataText = await readFile(
		resolve(import.meta.dirname, "../package.json"),
		{
			encoding: "utf8",
		},
	);

	return JSON.parse(stellarPackageMetadataText);
}
