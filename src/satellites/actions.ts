import { flatten, pipe, values } from "ramda";

/**
 * This contains all the protected keys, that can not be modified by the mod
 * groups.
 *
 * @type {Array}
 */
const PROTECTED_KEYS = ["name", "run"];

/**
 * This class manage all actions.
 */
class Actions {
	/**
	 * API reference.
	 *
	 * @type {null}
	 */
	api = null;

	/**
	 * Hash map with the registered actions.
	 *
	 * @type {{}}
	 */
	actions = {};

	/**
	 * Separate actions by version.
	 *
	 * @type {{}}
	 */
	versions = {};

	/**
	 * Hash map with the middleware by actions.
	 *
	 * @type {{}}
	 */
	middleware = {};

	/**
	 * Global middleware.
	 *
	 * @type {Array}
	 */
	globalMiddleware = [];

	/**
	 * This Map contains all the metadata changes that be applied to the actions.
	 *
	 * @type {Map}
	 */
	groups = new Map();

	/**
	 * This Map stores the actions associated with a group.
	 *
	 * @type {Map}
	 */
	groupsActions = new Map();

	/**
	 * Create a new actions manager instance.
	 *
	 * @param api
	 */
	constructor(api) {
		this.api = api;
	}

	/**
	 * Execute an action.
	 *
	 * This allow developers call actions internally.
	 *
	 * @param actionName  Name of the action to be called.
	 * @param params      Action parameters.
	 */
	async call(actionName, params = {}) {
		const ConnectionClass = this.api.connection;

		// create a new internal connection object
		const connection = new ConnectionClass(this.api, {
			type: "internal",
			remotePort: 0,
			remoteHostname: 0,
			rawConnection: {},
		});

		// set connection params
		connection.params = params;
		connection.params.action = actionName;

		// create a new ActionProcessor instance
		const ActionProcessor = this.api.actionProcessor;
		const actionProcessor = new ActionProcessor(
			this.api,
			connection,
		);

		const data = await actionProcessor.processAction();

		// destroy the connection and resolve of reject the promise
		connection.destroy();
		if (data.response.error !== undefined) {
			throw data.response.error;
		}

		return data.response;
	}

	/**
	 * This loads some system action.
	 *
	 * Available action:
	 *  - status: give information about the name and the server status.
	 */
	loadSystemActions() {
		// only load this if the system actions are enabled
		//
		// @see api.configs.enableSystemActions
		if (this.api.config.enableSystemActions !== true) {
			return;
		}

		// add an action to give some information about the server status
		this.versions.status = [1];
		this.actions.status = {
			1: {
				name: "status",
				description: "Is a system action to show the server status",
				run: (api, action, next) => {
					// finish the action execution
					next();
				},
			},
		};
	}

	async loadAction(actionFilePath, moduleName, action, reload = false) {
		const loadMessage = (action) => {
			const level = reload ? "info" : "debug";
			let msg = null;

			if (reload) {
				msg = `action (re)loaded: ${action.name} @ v${action.version}, ${actionFilePath}`;
			} else {
				msg = `action loaded: ${action.name} @ v${action.version}, ${actionFilePath}`;
			}

			this.api.log(msg, level);
		};

		// if there is no version defined set it to 1.0
		if (action.version === null || action.version === undefined) {
			action.version = 1.0;
		}

		// if the action not exists create a new entry on the hash map
		if (
			this.actions[action.name] === null ||
			this.actions[action.name] === undefined
		) {
			this.actions[action.name] = {};
		}

		// if the action exists and are protected return now
		if (
			this.actions[action.name][action.version] !== undefined &&
			this.actions[action.name][action.version].protected !== undefined &&
			this.actions[action.name][action.version].protected === true
		) {
			return;
		}

		if (!reload) {
			// associate the action to the module (this must only be made once)
			this.api.modules.regModuleAction(moduleName, action.name);
		} else {
			// Groups: apply the necessary actions modifications (this is only
			// made on the reload because on the loading we don't have the
			// necessary information for this)
			this._applyModificationsToAction(action);
		}

		// put the action on correct version slot
		this.actions[action.name][action.version] = action;
		if (
			this.versions[action.name] === null ||
			this.versions[action.name] === undefined
		) {
			this.versions[action.name] = [];
		}
		this.versions[action.name].push(action.version);
		this.versions[action.name].sort();

		// validate the action data
		this.validateAction(this.actions[action.name][action.version]);

		// send a log message
		loadMessage(action);
	}

	/**
	 * Load a new action file.
	 *
	 * @param fullFilePath
	 * @param reload
	 */
	async loadFile(fullFilePath, moduleName, reload = false) {
		// watch for changes on the action file
		this.api.configs.watchFileAndAct(fullFilePath, async () => {
			// reload the changed action file
			await this.loadFile(fullFilePath, moduleName, true);

			// reload post variables
			this.api.params.buildPostVariables();

			// reload routes
			this.api.routes.loadRoutes();
		});

		const action = null;

		try {
			// a single action file may contain multiple action definitions so we make sure that we load everything
			const moduleExportSymbols = await import(
				`${fullFilePath}?cache=${Date.now()}`
			);
			const collection = pipe(values, flatten)(moduleExportSymbols);

			for (const action of collection) {
				await this.loadAction(fullFilePath, moduleName, action, reload);
			}
		} catch (err) {
			try {
				this.api.exceptionHandlers.loader(fullFilePath, err);
				if (action) {
					delete this.actions[action.name][action.version];
				}
			} catch (err2) {
				throw err;
			}
		}
	}

	/**
	 * Validate some action requirements.
	 *
	 * @param action  Action object to be validated.
	 */
	validateAction(action) {
		// fail function
		const fail = (msg) => this.api.log(msg, "error");

		// initialize inputs property
		if (action.inputs === undefined) {
			action.inputs = {};
		}

		// initialize private property
		if (action.private === undefined) {
			action.private = false;
		}

		// initialize protected property
		if (action.protected === undefined) {
			action.protected = false;
		}

		// the name, description, run properties are required
		if (typeof action.name !== "string" || action.name.length < 1) {
			fail("an action is missing 'action.name'");
			return false;
		} else if (
			typeof action.description !== "string" ||
			action.description.length < 1
		) {
			fail(`Action ${action.name} is missing 'action.description'`);
			return false;
		} else if (typeof action.run !== "function") {
			fail(`Action ${action.run} has no run method`);
			return false;
		} else if (
			this.api.connections !== null &&
			this.api.connections.allowedVerbs.indexOf(action.name) >= 0
		) {
			fail(
				`${action.run} is a reserved verb for connections. Choose a new name`,
			);
			return false;
		} else {
			return true;
		}
	}

	/**
	 * Add a new middleware.
	 *
	 * @param data  Middleware to be added.
	 */
	addMiddleware(data) {
		// middleware require a name
		if (!data.name) {
			throw new Error("middleware.name is required");
		}

		// if there is no defined priority use the default
		if (!data.priority) {
			data.priority = this.api.config.general.defaultMiddlewarePriority;
		}

		// ensure the priority is a number
		data.priority = Number(data.priority);

		// save the new middleware
		this.middleware[data.name] = data;

		// if this is a local middleware return now
		if (data.global !== true) {
			return;
		}

		// push the new middleware to the global list
		this.globalMiddleware.push(data.name);

		// sort the global middleware array
		this.globalMiddleware.sort((a, b) => {
			if (this.middleware[a].priority > this.middleware[b].priority) {
				return 1;
			}

			return -1;
		});
	}

	async loadMiddlewareFromFile(path, reload = false) {
		/**
		 * Function to log the load ou reload message
		 *
		 * @param middleware  Middleware object
		 */
		const loadMessage = (middleware) => {
			const level = reload ? "info" : "debug";
			let msg = null;

			if (reload) {
				msg = `middleware (re)loaded: ${middleware.name}, ${path}`;
			} else {
				msg = `middleware loaded: ${middleware.name}, ${path}`;
			}

			this.api.log(msg, level);
		};

		// watch for changes on the middleware file
		this.api.configs.watchFileAndAct(path, () => this.loadMiddlewareFromFile(path, true));

		// try load the middleware
		try {
			// load middleware file
			const collection = await import(path);

			// iterate all collection definitions
			for (const index in collection) {
				// get middleware object
				const middleware = collection[index];

				// try load middleware object
				this.addMiddleware(middleware);

				// send a log message
				loadMessage(middleware);
			}
		} catch (error) {
			this.api.exceptionHandlers.loader(path, error);
		}
	}

	// ----------------------------------------------------- [Modification System]

	/**
	 * Load the modifier and apply it to all already loaded actions.
	 *
	 * @param {object} modifier
	 */
	loadModifier(modifier) {
		// the modifier is a hash that the keys correspond to group names
		const groups = Object.keys(modifier);

		// iterate all groups
		groups.forEach((groupName) => {
			// get the group content
			const group = modifier[groupName];

			// array to store the group's actions
			let actions = [];

			// process the `actions` property. This is simpler as concat the two arrays
			if (Array.isArray(group.actions)) {
				actions = actions.concat(group.actions);
			}

			// process the `modules` property
			if (Array.isArray(group.modules)) {
				// iterate all groups and for each one load the actions
				group.modules.forEach((groupName) => {
					actions = actions.concat(
						this.api.modules.moduleActions.get(groupName) || [],
					);
				});
			}

			// save the actions that compose this group
			this.groupsActions.set(groupName, actions);

			// save the group metadata modifications to apply to the actions, later
			this.groups.set(groupName, group.metadata);
		});
	}

	/**
	 * Gets all the groups thats the given action is part of.
	 *
	 * @param {string} actionName
	 */
	_checkWhatGroupsArePresent(actionName) {
		// this array will store the groups of which the action is part
		const result = [];

		// iterate all groups
		this.groupsActions.forEach((actions, groupName) => {
			if (actions.includes(actionName)) {
				result.push(groupName);
			}
		});

		return result;
	}

	/**
	 * Apply the group modification to the action.
	 *
	 * @param {string} groupName Group name
	 * @param {object} action Action object where the modifications must be
	 *                        applied.
	 */
	_applyGroupModToAction(groupName, action) {
		// get group metadata modifications
		const metadata = this.groups.get(groupName);

		// iterate all modification keys
		for (let key of Object.keys(metadata)) {
			let value = metadata[key];

			// if there is a protected key, ignore it
			if (PROTECTED_KEYS.includes(key)) {
				continue;
			}

			// check if the key start with a '+'. If yes, that means that is to
			// append an item to an array, or create it if not exists
			if (key.charAt(0) === "+") {
				// create a sub-string without the plus sign
				key = key.substring(1, key.length);

				// set the new value
				action[key] = (action[key] || []).concat(value);

				continue;
			} else if (key.charAt(0) === "-") {
				// create a sub-string without the plus sign
				key = key.substring(1, key.length);

				// this needs to be an Array
				if (Array.isArray(action[key])) {
					action[key] = action[key].filter((item) => !value.includes(item));
				}

				continue;
			}

			// if the value is a function we need process it
			if (typeof value === "function") {
				value = value(action, action[key]);
			}

			// replace the value
			action[key] = value;
		}
	}

	/**
	 * Applies the modifications to an action from each group that them makes part
	 * of.
	 *
	 * @param {object} action Action object.
	 */
	_applyModificationsToAction(action) {
		// when the action has a group defined, the action name must be pushed
		// to the `groupsActions`
		if (this.api.utils.isNonEmptyString(action.group)) {
			// if the key doesn't exists we must create one with an empty array
			if (!this.groupsActions.has(action.group)) {
				this.groupsActions.set(action.group, []);
			}

			// get the array of actions
			const arrayOfActions = this.groupsActions.get(action.group);

			// to prevent duplicated entries, it's necessary check if the array
			// already exists on the array
			if (!arrayOfActions.includes(action.name)) {
				arrayOfActions.push(action.name);
			}
		}

		// check the groups here the action is present and apply the modifications
		const groupNames = this._checkWhatGroupsArePresent(action.name);

		// apply the changes of all founded groups
		groupNames.forEach((groupName) => this._applyGroupModToAction(groupName, action));
	}

	/**
	 * Iterate all the actions and apply the respective group modifications.
	 */
	_applyGroupModifications() {
		// iterate all actions
		Object.keys(this.actions).forEach((actionName) => {
			// get all action versions
			const actionVersion = this.actions[actionName];

			// iterate all action versions
			Object.keys(actionVersion).forEach((versionNumber) => {
				// apply the group modifications
				this._applyModificationsToAction(actionVersion[versionNumber]);
			});
		});
	}
}

/**
 * Initializer to load the actions features into the Engine.
 */
export default class {
	/**
	 * Initializer load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 410;

	/**
	 * Initializer load function.
	 *
	 * @param api   API reference
	 */
	async load(api) {
		// add the actions class to the api
		api.actions = new Actions(api);

		// load system actions
		api.actions.loadSystemActions();

		// iterate all modules and load all actions
		for (const [moduleName, modulePath] of api.modules.modulesPaths) {
			// load modules middleware
			const middlewarePaths = api.utils.recursiveDirectoryGlob(
				`${modulePath}/middleware`,
			);
			for (const path of middlewarePaths) {
				await api.actions.loadMiddlewareFromFile(path);
			}

			// get all files from the module "actions" folder
			const actionFiles = api.utils.recursiveDirectoryGlob(
				`${modulePath}/actions`,
			);
			for (const actionFile of actionFiles) {
				await api.actions.loadFile(actionFile, moduleName);
			}
		}

		// load the modules after the action in order to reduce the number of operations to apply the group modifications
		for (const modulePath of api.modules.modulesPaths.values()) {
			const modPath = `${modulePath}/mod.js`;

			// if the module `mod.js` file exists, load it.
			if (api.utils.fileExists(modPath)) {
				const modifierDef = (await import(modPath)).default(api);
				api.actions.loadModifier(modifierDef.actions);

				// when the modifier file changes we must reload the entire server
				api.configs.watchFileAndAct(modPath, () => api.commands.restart.call(api._self));
			}
		}

		api.actions._applyGroupModifications();
	}
}
