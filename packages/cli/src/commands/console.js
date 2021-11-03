"use strict";

// ----------------------------------------------------------------------------- [Imports]

const Command = require("../Command");
const REPL = require("repl");

// ----------------------------------------------------------------------------- [Command]

class ConsoleCommand extends Command {
  constructor() {
    // request the engine initialization
    super(true);

    // define the command
    this.flags = "console";
    this.desc = "Create a REPL connection with a Stellar instance";
  }

  exec() {
    // disable all the servers
    for (const index in this.api.configs.servers) {
      this.api.configs.servers[index].enabled = false;
    }

    // disable development mode
    this.api.configs.general.developmentMode = false;

    // disable the task manager system
    this.api.configs.tasks.scheduler = false;
    this.api.configs.tasks.queues = [];
    this.api.configs.tasks.minTaskProcessors = 0;
    this.api.configs.tasks.maxTaskProcessors = 0;

    // start the engine
    this.engine.start((error, api) => {
      // if an error occurs throw it
      if (error) {
        throw error;
      }

      // give some time the server goes up
      setTimeout((_) => {
        // create a REPL instance
        const repl = REPL.start({
          prompt: `${api.env}>`,
          input: process.stdin,
          output: process.stdout,
          useGlobal: false,
        });

        // put the api into context
        repl.context.api = api;

        // when the user exists REPL we must check if the Stella are stopped,
        // otherwise we stop it first
        repl.on("exit", () => {
          if (api.status !== "stopped") {
            this.engine.stop(() => {
              process.exit(0);
            });
          }
        });
      }, 500);
    });
  }
}

// export command
module.exports = new ConsoleCommand();
