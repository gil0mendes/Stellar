import { Command } from "../Command.js";
import { exists, generateFileFromTemplate } from "../utils.js";
import process from "node:process";

class dockerItCommand extends Command {
	constructor() {
		super(false);

		// command
		this.flags = "dockerIt";
		this.desc = "Create a new dockerfile for the stellar project";
	}

	/**
	 * Execute the command.
	 */
	async exec() {
		// see if a dockerfile already exists
		if (await exists(`${process.cwd()}/dockerfile`)) {
			this.printError("A dockerfile already exists");
			return false;
		}

		// create manifest.json file
		generateFileFromTemplate("dockerfile", {}, `${process.cwd()}/dockerfile`);

		// print a success message
		this.printSuccess(
			`A dockerfile was created in the project root.\nCreate the image with: docker build -t <image_name> .\nCreate a container with: docker run -t -p 8080:8080 --name <container_name> <image_name>`,
		);
	}
}

export default new dockerItCommand().buildCommand();
