import { createVitest } from "vitest/node";
import { Command } from "../Command.js";
import { getAppModules, getCurrentUniverse } from "../utils.js";

import Engine from "../../src/engine.ts";

/**
 * Test command class.
 *
 * @todo add support to test a single module or some modules using commas.
 */
class TestCommand extends Command {
	/**
	 * Create a new TestCommand instance.
	 */
	constructor() {
		// execute the super class constructor method
		super();

		// command definition
		this.flags = "test";
		this.desc = "Run application tests";
	}

	/**
	 * Get the modules tests folder.
	 *
	 * @param moduleName  Module name to get the tests folder path.
	 */
	getModuleTestPath(moduleName) {
		return `${Utils.getCurrentUniverse()}/modules/${moduleName}/tests`;
	}

	/**
	 * Execute the command.
	 */
	async exec() {
		const modules = getAppModules();

		// if the modules are empty return a message
		if (modules.length === 0) {
			return this.printInfo(`There is no active module to run tests.`);
		}
		const runPath = getCurrentUniverse();
		const vitest = await createVitest("test", {
			root: runPath,
		});

		console.log(`${this.FgBlue}Starting Stellar test suit in your application`);

		global.engine = new Engine({ rootPath: runPath });

		await vitest.start([`${runPath}/**/*.{spec,test}.js`]);
	}
}

export default new TestCommand().buildCommand();
