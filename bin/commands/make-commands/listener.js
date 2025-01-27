"use strict";

// ----------------------------------------------------------------------------- [Imports]

let Command = require("../../Command");
let Utils = require("../../utils");

// ----------------------------------------------------------------------------- [Class]

class MakeListener extends Command {
	/**
	 * Create a new MakeListener class instance.
	 */
	constructor() {
		// execute the super class constructor methods
		super();

		// command definition
		this.group = "Components:";
		this.flags = "listener <listener_name>";
		this.desc = "Create a new event listener";
		this.paramsDesc = "The name of the listener to create";
	}

	/**
	 * Execute the command.
	 */
	exec() {
		if (this.args.module.length === 0) {
			return this.printError("You need to specify the module where the listener must be created");
		}

		// check if the module exists
		if (!Utils.moduleExists(this.args.module)) {
			return this.printError(`The module "${this.args.module}" does not exists`);
		}

		// get listener name
		let listenerName = this.args.listener_name;

		// get listeners folder path
		let listenersPath = `${Utils.getCurrentUniverse()}/modules/${this.args.module}/listeners`;

		// build the full listener path
		let outputPath = `${listenersPath}/${listenerName.replace(/\./g, "_")}.js`;

		// create listeners folder if not exists
		Utils.createFolderIfNotExists(listenersPath);

		// generate listener file
		Utils.generateFileFromTemplate("listener", { name: listenerName }, outputPath);

		// print a success message
		this.printSuccess(`The "${listenerName}" listener was created!`);
	}
}

// export command
module.exports = new MakeListener();
