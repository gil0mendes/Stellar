"use strict";

const Engine = require("@stellarfw/core/lib/engine").default;
const path = require("path");
const pkg = require("../package.json");
const spawn = require("child_process").spawn;

/**
 * All command extends this class in order to initialize Stellar and
 * provide a standard way of creating commands.
 */
module.exports = class {
  /**
   * Creates a new command instance.
   *
   * @type {boolean} initialize When true Stellar will be initialized on the
   * run method execution.
   */
  constructor(initialize = false) {
    // define console colors
    this.FgRed = "\x1b[31m";
    this.FgGreen = "\x1b[32m";
    this.FgYellow = "\x1b[33m";
    this.FgBlue = "\x1b[34m";
    this.FgWhite = "\x1b[37m";
    this.FgDefault = "\x1b[39m";

    // define console font states
    this.FontBold = "\x1b[1m";
    this.FontNormal = "\x1b[0m";

    // store if is to initialize
    this.isToInitialize = initialize;
    this.api = null;
    this.engine = null;

    // FIX `this` binding in the `run` method
    this.run = this.run.bind(this);
  }

  /**
   * Build the scope to create a new Stellar instance.
   */
  _buildScope() {
    return {
      rootPath: process.cwd(),
      stellarPackageJSON: pkg,
      args: this.args,
    };
  }

  /**
   * Initialize a Stellar instance when requested.
   */
  async _initializeStellar() {
    // create a new engine instance and initialize it
    const scope = this._buildScope();
    this.engine = new Engine(scope);
    await this.engine.initialize();

    this.api = this.engine.api;

    return this.api;
  }

  /**
   * Catch the sywac command call.
   */
  run(args) {
    // store the args
    this.args = args;

    // if the user requested to run this as a deamon we must spawn a new process
    if (this.args.daemon) {
      // create a new set of arguments removing the `--daemon` options
      const newArgs = process.argv.splice(2);
      for (const i in newArgs) {
        if (newArgs[i].indexOf("--daemon") >= 0) {
          newArgs.splice(i, 1);
        }
      }
      newArgs.push("--isDaemon=true");

      const command = path.normalize(`${__dirname}/stellar`);
      const child = spawn(command, newArgs, {
        detached: true,
        cwd: process.cwd(),
        env: process.env,
        stdio: "ignore",
      });
      console.log(`${command} ${newArgs.join(" ")}`);
      console.log(`Spawned child process with pid ${child.pid}`);

      // finish the current process
      process.nextTick((_) => {
        process.exit(0);
      });
      return;
    }

    // check if is to initialize the Engine
    if (this.isToInitialize) {
      return this._initializeStellar()
        .then((_) => {
          this.exec();
        })
        .catch((error) => {
          this.printError(error);
        });
    }

    // run the command
    this.exec();
  }

  /**
   * Print an error message.
   *
   * @param msg Message to be printed.
   */
  printError(msg) {
    console.log(`${this.FontBold}${this.FgRed}Error: ${msg}${this.FgDefault}${this.FontNormal}`);
  }

  /**
   * Print an info message.
   *
   * @param msg Message to be printed.
   */
  printInfo(msg) {
    console.log(`${this.FgBlue}Info: ${msg}${this.FgDefault}`);
  }

  /**
   * Print a success message.
   *
   * @param msg Message to be printed.
   */
  printSuccess(msg) {
    console.log(`${this.FgGreen}Success: ${msg}${this.FgDefault}`);
  }
};
