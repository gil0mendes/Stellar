"use strict";

// ----------------------------------------------------------------------------- [Imports]

let Command = require("../../Command");
let Utils = require("../../utils");

// ----------------------------------------------------------------------------- [Command]

class MakeTest extends Command {
	/**
	 * Create a new instance of this command.
	 */
	constructor() {
		// execute the super class constructor method
		super();

		// command
		this.group = "Components:";
		this.flags = "test <file_name>";
		this.desc = "Create a new test file";
		this.paramsDesc = "The name of the test file to create";
	}

	/**
	 * Execute the command.
	 */
	exec() {
		// check if the module was specified
		if (this.args.module.length === 0) {
			return this.printError("You need to specify the module where the task must be created");
		}

		// check if the module exists
		if (!Utils.moduleExists(this.args.module)) {
			return this.printError(`The module "${this.args.module}" does not exists`);
		}

		// ensure the test folder exists
		const testFolder = `${Utils.getCurrentUniverse()}/modules/${this.args.module}/tests`;
		if (!Utils.exists(testFolder)) Utils.createFolder(testFolder);

		// get the file name
		const fileName = this.args.file_name;

		// build the output path
		const newFilePath = `${testFolder}/${fileName}.js`;

		// check if the file already exists
		if (!this.args.force && Utils.exists(newFilePath)) {
			return this.printError(`The test file already exists. Use --force param to overwrite.`);
		}

		// generate the new file
		Utils.generateFileFromTemplate("test", {}, newFilePath);

		// print a success message
		this.printSuccess(`The "${fileName}" test was created!`);
	}
}

// export command
module.exports = new MakeTest();
