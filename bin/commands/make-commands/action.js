"use strict";

// ----------------------------------------------------------------------------- [Imports]

const Command = require("../../Command");
const Utils = require("../../utils");

// ----------------------------------------------------------------------------- [Command]

class MakeAction extends Command {
	/**
	 * Create a new MakeAction instance.
	 */
	constructor() {
		// execute the super class constructor method
		super();

		// command definition
		this.group = "Components:";
		this.flags = "action <action_name>";
		this.desc = "Create a new action file";
		this.paramsDesc = "The name of the action to create";
	}

	/**
	 * Execute the command
	 */
	exec() {
		if (this.args.module.length === 0) {
			return this.printError("You need to specify the module where the action must be created");
		}

		// check if the module exists
		if (!Utils.moduleExists(this.args.module)) {
			return this.printError(`The module "${this.args.module}" does not exists`);
		}

		// get useful action information
		let actionName = this.args.action_name || this.args.model;
		let actionsPath = `${Utils.getCurrentUniverse()}/modules/${this.args.module}/actions`;
		let outputPath = `${actionsPath}/${actionName.replace(".", "_")}.js`;

		// the actionName needs to be present
		if (!actionName) {
			this.printError("You need to specify the action name or the model");
			return false;
		}

		// if there is not force param and the file already exists return an error
		// message
		if (this.args.force === undefined && Utils.exists(outputPath)) {
			this.printError(`The action file already exists. Use --force param to overwrite.`);
			return false;
		}

		if (this.args.model) {
			// get the model name
			const modelNameNormalized = actionName.toLowerCase();

			// hash with the data to use on the template
			const data = {
				modelName: modelNameNormalized,
				modelNameCapitalize: modelNameNormalized.charAt(0).toUpperCase() + modelNameNormalized.slice(1),
			};

			// process the template
			Utils.generateFileFromTemplate("actionCrud", data, outputPath);

			// print success message
			this.printSuccess(`The CRUD operations for the "${modelNameNormalized}" model was created!`);

			return true;
		}

		// create the actions folder is not exists
		Utils.createFolderIfNotExists(actionsPath);

		// generate action file
		Utils.generateFileFromTemplate("action", { actionName: actionName }, outputPath);

		// print a success message
		this.printSuccess(`The "${actionName}" action was created!`);

		return true;
	}
}

// export command
module.exports = new MakeAction();
