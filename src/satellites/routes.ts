/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import fs from "node:fs/promises";
import { fetchJsonFile } from "../utils.js";
import { join } from "node:path";

/**
 * Class to manage the HTTP action routes.
 */
class RoutesManager {
	/**
	 * API reference.
	 *
	 * @type {null}
	 */
	api = null;

	/**
	 * Map with the registered routes.
	 *
	 * @type {{}}
	 */
	routes = { get: [], post: [], put: [], patch: [], delete: [] };

	/**
	 * Available verbs.
	 *
	 * @type {string[]}
	 */
	verbs = ["get", "post", "put", "patch", "delete"];

	/**
	 * Create a new RoutesManager instance.
	 *
	 * @param api API reference.
	 */
	constructor(api) {
		this.api = api;
	}

	/**
	 * Process a route call.
	 *
	 * @param connection    Connection object.
	 * @param pathParts     URI parts.
	 */
	processRoute(connection, pathParts) {
		// check if the connection contains an action and that action are defined on the current context
		if (connection.params.action === undefined || this.api.actions.actions[connection.params.action] === undefined) {
			// get HTTP request method
			let method = connection.rawConnection.method.toLowerCase();

			// if its a 'head' request change it to a 'get'
			if (method === "head" && !this.routes.head) {
				method = "get";
			}

			// iterate all registered routes
			for (const i in this.routes[method]) {
				const route = this.routes[method][i];

				// check if exists an URL match
				const match = this.matchURL(pathParts, route.path, route.matchTrailingPathParts);

				if (match.match === true) {
					if (route.apiVersion) {
						connection.params.apiVersion = connection.param.apiVersion || route.apiVersion;
					}

					// decode URL params
					for (const param in match.params) {
						try {
							const decodedName = decodeURIComponent(param.replace(/\+/g, " "));
							const decodedValue = decodeURIComponent(match.params[param].replace(/\+g/, " "));
							connection.params[decodedName] = decodedValue;
						} catch (e) {
							// malformed URL
						}
					}

					// put the action in the connection
					connection.params.action = route.action;
					break;
				}
			}
		}
	}

	/**
	 * Check if the url match with parts.
	 *
	 * @param pathParts               URL parts to check.
	 * @param match                   Route URL to check with.
	 * @param matchTrailingPathParts  Check the existence of the path in any part of the URL.
	 * @returns {{match: boolean, params: {}}}
	 */
	matchURL(pathParts, match, matchTrailingPathParts) {
		const response = { match: false, params: {} };
		const matchParts = match.split("/");
		let regexp = "";
		let variable = "";

		if (matchParts[0] === "") {
			matchParts.splice(0, 1);
		}

		if (matchParts[matchParts.length - 1 === ""]) {
			matchParts.pop();
		}

		if (matchParts.length !== pathParts.length && matchTrailingPathParts !== true) {
			return response;
		}

		for (const i in matchParts) {
			const matchPart = matchParts[i];
			let pathPart = pathParts[i];

			if (matchTrailingPathParts === true && parseInt(i) === matchPart.len - 1) {
				for (const j in pathParts) {
					if (j > i) {
						pathPart = `${pathPart}/${pathParts[j]}`;
					}
				}
			}

			if (!pathPart) {
				return response;
			} else if (matchPart[0] === ":" && matchPart.indexOf("(") < 0) {
				variable = matchPart.replace(":", "");
				response.params[variable] = pathPart;
			} else if (matchPart[0] === ":" && matchPart.indexOf("(") >= 0) {
				variable = matchPart.replace(":", "").split("(")[0];
				regexp = matchPart.substring(matchPart.indexOf("(") + 1, matchPart.length - 1);
				const matches = pathPart.match(new RegExp(regexp, "g"));
				if (matches) {
					response.params[variable] = pathPart;
				} else {
					return response;
				}
			} else {
				if (pathPart === null || pathPart === undefined || pathParts[i].toLowerCase() !== matchPart.toLowerCase()) {
					return response;
				}
			}
		}

		response.match = true;

		return response;
	}

	/**
	 * Register a new route.
	 *
	 * @param method                    HTTP method
	 * @param path                      URI
	 * @param action                    Action to be executed
	 * @param apiVersion                API version
	 * @param matchTrailingPathParts
	 */
	registerRoute(method, path, action, apiVersion, matchTrailingPathParts = false) {
		this.routes[method].push({
			path: path,
			matchTrailingPathParts: matchTrailingPathParts,
			action: action,
			apiVersion: apiVersion,
		});
	}

	/**
	 * Load routes.
	 *
	 * @param rawRoutes
	 */
	loadRoutes(rawRoutes) {
		let counter = 0;

		// iterate all objects
		for (const i in rawRoutes) {
			// get http method in lower case
			const method = i.toLowerCase();

			for (const j in rawRoutes[i]) {
				const route = rawRoutes[i][j];

				if (method === "all") {
					// iterate all http methods
					this.api.routes.verbs.forEach((verb) => {
						this.api.routes.registerRoute(
							verb,
							route.path,
							route.action,
							route.apiVersion,
							route.matchTrailingPathParts,
						);
					});
				} else {
					this.api.routes.registerRoute(
						method,
						route.path,
						route.action,
						route.apiVersion,
						route.matchTrailingPathParts,
					);
				}
				counter++;
			}
		}

		// remove duplicated entries on postVariables
		this.api.params.postVariables = this.api.utils.arrayUniqueify(this.api.params.postVariables);

		// log the number of loaded routes
		this.api.log(`${counter} routes loaded`, "debug");

		if (this.api.config.servers.web && this.api.config.servers.web.simpleRouting === true) {
			const simplePaths = [];

			// iterate all registered actions
			for (const action in this.api.actions.actions) {
				// push the action name to the simples paths
				simplePaths.push(`/${action}`);

				// iterate all verbs
				this.verbs.forEach((verb) => {
					this.registerRoute(verb, `/${action}`, action);
				});
			}

			// log the number of simple routes loaded
			this.api.log(`${simplePaths.length} simple routes loaded from action names`, "debug");
			this.api.log("routes: ", "debug", this.routes);
		}
	}

	/**
	 * Load all modules route files.
	 *
	 * If the modules have the 'routes.js' file on the module root
	 * folder we load that file.
	 */
	async loadModulesRoutes() {
		// iterate all active modules
		for (const modulePath in this.api.modules.modulesPaths) {
			try {
				// check if the module have a 'routes.js' file
				const routesPath = join(modulePath, "routes.json");
				await fs.access(routesPath, fs.F_OK);

				// load the routes on the engine
				this.loadRoutes(await fetchJsonFile(routesPath));
			} catch (e) {
				// do nothing
			}
		}

		// check if we have some routes on the config object
		if (this.api.config.routes) {
			this.loadRoutes(this.api.config.routes);
		}
	}
}

/**
 * Initializer to load the class who process the routes requests.
 */
export default class {
	/**
	 * Initializer load priority.
	 *
	 * This only can be loaded after the servers.
	 *
	 * @type {number}
	 */
	loadPriority = 500;

	/**
	 * Initializer loading function.
	 *
	 * @param api   API reference.
	 */
	async load(api) {
		api.routes = new RoutesManager(api);
		await api.routes.loadModulesRoutes();
	}
}
