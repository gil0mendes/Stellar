import fs from "node:fs";
import { join } from "node:path";

class DocumentationGenerator {
	/**
	 * API reference object.
	 *
	 * @type {null}
	 */
	api = null;

	/**
	 * Docs folder path.
	 *
	 * @type {string}
	 */
	docsFolder = "";

	/**
	 * Static folder path.
	 *
	 * @type {string}
	 */
	staticFolder = "";

	/**
	 * Constructor.
	 *
	 * @param api
	 */
	constructor(api) {
		// save API reference object
		this.api = api;

		// unsure the public folder exists
		this.api.utils.createFolder(this.api.config.general.paths.public);

		// build docs folder path
		this.docsFolder = join(this.api.config.general.paths.public, "docs");

		// build static folder path
		this.staticFolder = join(import.meta.dirname, `../../staticFiles/docs`);
	}

	/**
	 * Generate an array with all information needed to build the list of tasks.
	 */
	_getTasksInformation() {
		// array to store all the tasks
		const tasks = [];

		// iterate all registered tasks
		Object.keys(this.api.tasks.tasks).forEach((key) => {
			const task = this.api.tasks.tasks[key];
			tasks.push({
				name: task.name,
				description: task.description || "N/A",
				frequency: task.frequency || "-",
			});
		});

		return tasks;
	}

	/**
	 * Get all actions who have toDocument different than false.
	 *
	 * @returns {{}}  Actions to generate documentation.
	 * @private
	 */
	_getActionToGenerateDoc() {
		// array to store the actions
		let actions = {};

		// iterate all actions
		for (let actionName in this.api.actions.actions) {
			let count = 0;

			actions[actionName] = {};

			// iterate all action versions
			for (let versionNumber in this.api.actions.actions[actionName]) {
				if (this.api.actions.actions[actionName][versionNumber].toDocument !== false) {
					count++;
					actions[actionName][versionNumber] = this.api.actions.actions[actionName][versionNumber];
				}
			}

			if (count === 0) {
				delete actions[actionName];
			}
		}

		return actions;
	}

	/**
	 * Generate the documentation.
	 */
	async generateDocumentation() {
		// remove docs directory
		this.api.utils.removeDirectory(this.docsFolder);

		// create the directory again
		this.api.utils.createFolder(this.docsFolder);

		// get actions to generate documentation
		let actions = this._getActionToGenerateDoc();

		// object with the template data
		let data = { actions: Object.keys(actions) };

		// get base template
		const { render } = await import(join(this.staticFolder, `action.html.js`));

		// iterate all loaded actions
		for (let actionName in actions) {
			// set action name
			data.actionName = actionName;

			// initialize array
			data.actionVersions = [];

			// iterate all versions
			for (let versionNumber in actions[actionName]) {
				// get action object
				let action = this._prepareActionToPrint(actions[actionName][versionNumber]);

				// push the version number
				action.version = versionNumber;

				// push the new action to the actionVersions array
				data.actionVersions.push(action);
			}

			const generatedHtml = render(data);

			// output the result to the temp folder
			fs.writeFileSync(`${this.docsFolder}/action_${actionName}.html`, generatedHtml, "utf8");
		}

		// build the index.html
		await this._buildIndexFile();

		// copy resource files
		this._copyResourceFiles();
	}

	/**
	 * Build the index.html file.
	 *
	 * @private
	 */
	async _buildIndexFile() {
		// build data object
		let data = {
			actions: Object.keys(this._getActionToGenerateDoc()),
			project: {},
		};
		data.project.name = this.api.config.name;
		data.project.description = this.api.config.description;
		data.project.version = this.api.config.version;

		// append the tasks information
		data.tasks = this._getTasksInformation();

		const { render } = await import(join(this.staticFolder, `index.html.js`));
		const contentGenerated = render(data);

		// save index.html file on final docs folder
		fs.writeFileSync(`${this.docsFolder}/index.html`, contentGenerated, "utf8");
	}

	/**
	 * Prepare the action to be printed.
	 *
	 * @param action
	 * @returns {{}}
	 * @private
	 */
	_prepareActionToPrint(action) {
		// create a new object with the data prepared to be printed
		let output = {};

		// action name
		output.name = action.name;

		// action description
		output.description = action.description;

		// action output example
		if (action.outputExample !== undefined) {
			output.outputExample = JSON.stringify(action.outputExample, null, 4);
		}

		// action inputs
		if (action.inputs !== undefined) {
			output.inputs = [];

			// iterate all inputs
			Object.keys(action.inputs).forEach((inputName) => {
				let newInput = {};
				let input = action.inputs[inputName];

				newInput.name = inputName;
				newInput.description = input.description || "N/A";
				newInput.default = input.default || "N/A";

				newInput.validators = [];

				if (!(input.required === undefined || input.required === false)) {
					newInput.validators.push({ type: "required", value: "required" });
				}

				// validators
				if (typeof input.validator === "function") {
					newInput.validators.push({ type: "function", value: "function" });
				} else if (input.validator instanceof RegExp) {
					newInput.validators.push({
						type: "regex",
						value: String(input.validator),
					});
				} else if (typeof input.validator === "string") {
					// the validator string can have many validators separated by '|', we need to split them
					let validators = input.validator.split("|");

					for (let index in validators) {
						newInput.validators.push({
							type: "validator",
							value: validators[index],
						});
					}
				}

				// push the new input
				output.inputs.push(newInput);
			});
		}

		return output;
	}

	/**
	 * Copy resource files to final docs folder.
	 *
	 * @private
	 */
	_copyResourceFiles() {
		this.api.utils.copyFile(`${this.staticFolder}/reset.css`, `${this.docsFolder}/reset.css`);
		this.api.utils.copyFile(`${this.staticFolder}/style.css`, `${this.docsFolder}/style.css`);
		this.api.utils.copyFile(`${this.staticFolder}/highlight.js`, `${this.docsFolder}/highlight.js`);
	}
}

/**
 * This satellite is responsible to generate the documentation
 * for all project actions.
 */
export default class {
	/**
	 * Satellite load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 710;

	/**
	 * Satellite loading function.
	 *
	 * @param api   API reference object.
	 */
	async load(api) {
		// if the documentation generation was disabled finish now
		if (api.config.general.generateDocumentation !== true) {
			return;
		}

		// build the documentation
		await new DocumentationGenerator(api).generateDocumentation();
	}
}
