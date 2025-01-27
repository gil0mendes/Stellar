import async from "async";
import { join } from "node:path";

/**
 * Class to manage events.
 *
 * The developers can use this to manipulate data during the execution or to extend functionalities adding new
 * behaviours to existing logic. The listeners must be stored in <moduleName>/listeners.
 */
class EventsManager {
	/**
	 * API reference object.
	 *
	 * @type {null}
	 */
	api = null;

	/**
	 * Map with all registered events and listeners.
	 *
	 * @type {Map}
	 */
	events = new Map();

	/**
	 * Map to keep track of the file listeners.
	 *
	 * @type {Map}
	 */
	fileListeners = new Map();

	/**
	 * Create a new instance.
	 *
	 * @param api   API reference object.
	 */
	constructor(api) {
		this.api = api;
	}

	// --------------------------------------------------------------------------- [Commands]

	/**
	 * Fire an event.
	 *
	 * @param eventName   Event to fire.
	 * @param data        Params to pass to the listeners.
	 */
	fire(eventName, data) {
		// variable to store listener response data
		let responseData = data;

		// build a new promise and return them
		return new Promise((resolve) => {
			// if there is no listeners for the event finish the promise now
			if (!this.events.has(eventName)) {
				resolve(responseData);
			}

			// execute the listeners async in series
			async.each(
				this.events.get(eventName),
				(listener, callback) => listener.run(this.api, responseData, callback),
				() => {
					// resolve the promise returning the response data
					resolve(responseData);
				},
			);
		});
	}

	/**
	 * Register a new listener for an event.
	 *
	 * Build the new listener object.
	 *
	 * @param event     Event name.
	 * @param fn        Listener handler.
	 * @param priority  Priority.
	 */
	listener(event, fn, priority) {
		// build a listener object
		let listener = {
			event: event,
			run: fn,
			priority: priority,
		};

		// insert the listener
		this._listenerObj(listener);
	}

	/**
	 * Insert the listener object into the Map.
	 *
	 * The error messages are logged to the console, like warnings.
	 *
	 * @param listenerObj   Listener object.
	 * @return boolean      True if is all okay, false otherwise.
	 */
	_listenerObj(listenerObj) {
		// validate event name
		if (listenerObj.event === undefined) {
			this.api.log("invalid listener - missing event name", "warning");
			return false;
		}

		// validate run
		if (listenerObj.run === undefined || typeof listenerObj.run !== "function") {
			this.api.log("invalid listener - missing run property or not a function", "warning");
			return false;
		}

		// if priority are not defined
		if (listenerObj.priority === undefined) {
			listenerObj.priority = this.api.config.general.defaultListenerPriority;
		}

		// the event property can be an array, when the listener supports multiple
		// events, so we need to iterate it. When the event property is an string we
		// must convert it to an array in order to simplify the implementation
		const events = typeof listenerObj.event === "string" ? [listenerObj.event] : listenerObj.event;

		// iterate the events array. There is no need to change the event name,
		// because we don't use it when we execute the listener
		for (const event of events) {
			// if there is no listener for this event, create a new entry with an
			// empty array
			if (!this.events.has(event)) {
				this.events.set(event, []);
			}

			// get the array with all registered listeners for this event
			let listeners = this.events.get(event);

			// register the new listener
			listeners.push(listenerObj);

			// order the listeners by priority
			listeners.sort((l1, l2) => l1.priority - l2.priority);
		}

		return true;
	}

	/**
	 * Load a listener file.
	 */
	async _loadFile(path, reload = false) {
		// function to show a (re)load message
		const loadMessage = (listener) => {
			const level = reload ? "info" : "debug";
			let msg = null;

			if (reload) {
				msg = `listener (re)loaded: ${listener.event}, ${path}`;
			} else {
				msg = `listener loaded: ${listener.event}, ${path}`;
			}

			this.api.log(msg, level);
		};

		// require listener file
		let collection = await import(`${path}?cache=${Date.now()}`);

		// start watching for changes on the model
		if (!reload) {
			this._watchForChanges(path);
		}

		// array to keep all file listeners
		const listeners = [];

		for (let i in collection) {
			let listener = collection[i];

			// insert the listener on the map
			this._listenerObj(listener);
			listeners.push(listener);

			loadMessage(listener);
		}

		// keep track of the functions by file to make live-reload
		this.fileListeners.set(path, listeners);
	}

	/**
	 * Adds a listener to watch for file changes in order to reload the listeners.
	 */
	_watchForChanges(path) {
		this.api.configs.watchFileAndAct(path, async () => {
			// remove old listeners
			this.fileListeners.get(path).forEach((listener) => {
				// an listener can support multiple events, so we need iterate all
				const events = typeof listener.event === "string" ? [listener.event] : listener.event;

				for (const event of events) {
					// get array of functions
					const listeners = this.events.get(event);

					// get listener index
					const index = listeners.indexOf(listener);

					// remove listener
					listeners.splice(index, 1);
				}
			});

			// load the listeners again
			await this._loadFile(path, true);
		});
	}

	// --------------------------------------------------------------------------- [Other Methods]

	/**
	 * Iterate over all active modules and
	 */
	async loadListeners() {
		for (const [, modulePath] of this.api.modules.modulesPaths) {
			let listenersFolderPath = join(modulePath, "listeners");

			// some modules doesn't have listeners, if that is the case we can skip this module
			if (!this.api.utils.directoryExists(listenersFolderPath)) {
				continue;
			}

			// get all listeners files and load them
			const listenersFiles = this.api.utils.recursiveDirectoryGlob(listenersFolderPath);

			for (const listenerPath of listenersFiles) {
				await this._loadFile(listenerPath);
			}
		}
	}
}

/**
 * Satellite to load the event manager.
 */
export default class {
	/**
	 * Satellite load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 300;

	/**
	 * Satellite loading function.
	 *
	 * @param api   API reference object.
	 */
	async load(api) {
		api.events = new EventsManager(api);
		await api.events.loadListeners();
	}
}
