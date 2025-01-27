import Waterline from "waterline";
import { basename } from "node:path";
import { promisify } from "node:util";
import { mergeDeepRight } from "ramda";

/**
 * Satellite to manage the models using Waterline ORM.
 *
 * Using Waterline allow us interact with different kinds of database systems.
 */
class Models {
	/**
	 * Reference for the API object.
	 *
	 * @type null
	 */
	api = null;

	/**
	 * Waterline instance.
	 *
	 * @type {[type]}
	 */
	waterline = null;

	/**
	 * Object with the Waterline ontology.
	 *
	 * @type WaterlineOntology
	 */
	ontology = null;

	/**
	 * Create a new class instance.
	 *
	 * @param api   API reference.
	 */
	constructor(api) {
		this.api = api;
	}

	/**
	 * Create a new Waterline instance.
	 */
	async createNewInstance() {
		const adapters = await this.processAdapters();
		const datastores = this.api.config.models.datastores;
		const models = await this.loadModels();

		const ormStart = promisify(Waterline.start);

		this.waterline = await ormStart({
			adapters,
			datastores,
			models,
		});
	}

	/**
	 * Finish the model system.
	 */
	async finish() {
		const waterlineStop = promisify(Waterline.stop);
		await waterlineStop(this.waterline);
	}

	/**
	 * Preprocess the model.
	 *
	 * @param modelName model base name
	 * @param modelOrig original model object
	 */
	async preProcessModelData(modelName, modelOrig) {
		// The model definition can be a function, whether it happens we need pass
		// the api reference.
		if (typeof modelOrig === "function") {
			modelOrig = modelOrig(this.api);
		}

		const dataStoreToUse = modelOrig.datastore || this.api.config.models.defaultDatastore;

		// cerate a new model objects to merge the model into the default model properties defied in the configurations file
		const newModel = mergeDeepRight(this.api.config.models.defaultModelPropsForDatastore[dataStoreToUse], modelOrig);

		// Execute the `add` event to allow other modules modify this model before it
		// gets compiled.
		const { model } = await this.api.events.fire(`core.models.add.${modelName}`, {
			model: newModel,
		});

		// When there is no identity property defined we use the file basename.
		if (!model.identity) {
			model.identity = modelName;
		}

		model.datastore = dataStoreToUse;

		if (!model.schema) {
			model.schema = this.api.config.models.schema;
		}

		return model;
	}

	/**
	 * Load all models into the memory and preprocess them ot see if is valid
	 * data.
	 *
	 * @param models array of modules to be loaded
	 */
	async processModelsFiles(models) {
		const result = [];

		for (const modelFile of models) {
			const modelBasename = basename(modelFile, ".js");
			this._watchForChanges(modelFile);

			try {
				const model = await this.preProcessModelData(
					modelBasename,
					(await import(`${modelFile}?cache=${Date.now()}`)).default,
				);
				result.push(model);

				this.api.log(`Model loaded: ${modelBasename}`, "debug");
			} catch (error) {
				this.api.log(`Model error (${modelBasename}): ${error.message}`, "error", error);
			}
		}

		return result;
	}

	/**
	 * Load models from the modules.
	 */
	async loadModels() {
		let allModels = [];

		for (const [, modulePath] of this.api.modules.modulesPaths) {
			const modelFiles = this.api.utils.recursiveDirectoryGlob(`${modulePath}/models`);
			const processedModels = await this.processModelsFiles(modelFiles);
			allModels = [...allModels, ...processedModels];
		}

		return allModels.reduce((result, model) => ({ ...result, [model.identity]: model }), {});
	}

	/**
	 * If the development mode is active we must watch for changes.
	 *
	 * When the file changes we tack the following steps:
	 *  - log a message
	 *  - remove the file cache from require
	 *  - reload Stellar
	 */
	_watchForChanges(file) {
		// if the development mode is active we return
		if (!this.api.config.general.developmentMode) {
			return;
		}

		// due to how the ORM works when a mode file changes we need to restart Stellar
		this.api.configs.watchFileAndAct(file, () => {
			this.api.log(`\r\n\r\n*** rebooting due to model change (${file}) ***\r\n\r\n`, "info");
			this.api.commands.restart.call(this.api._self);
		});
	}

	/**
	 * Get a model object from the ontology.
	 *
	 * @param modelName                 Model name to get.
	 * @returns {WaterlineCollection}   Model object.
	 */
	get(modelName) {
		return Waterline.getModel(modelName, this.waterline);
	}

	/**
	 * Remove a model from the repository.
	 *
	 * @param modelName   model name to be deleted.
	 */
	remove(modelName) {
		this.models.delete(modelName);
	}

	/**
	 * Process adapters.
	 */
	async processAdapters() {
		// iterate all adapters and require the right modules. We need to do this
		// here other wise the config system will break when the module isn't
		// installed
		for (const key in this.api.config.models.adapters) {
			if (!this.api.utils.hasProp(key, this.api.config.models.adapters)) {
				continue;
			}

			// get module name
			const moduleName = this.api.config.models.adapters[key];

			// when we are restarting the server this already was replaced with the
			// module, so we ignore it
			if (typeof moduleName !== "string") {
				continue;
			}

			// replace the static value with the module instance
			this.api.config.models.adapters[key] = (await this.api.utils.require(moduleName)).default;

			// force all adapters to use the key specific by the user.
			this.api.config.models.adapters[key].identity = key;
		}

		return this.api.config.models.adapters;
	}
}

/**
 * Initializer for the models features.
 */
export default class {
	/**
	 * Initializer load priority.
	 *
	 * @type {number}
	 */
	loadPriority = 100;

	/**
	 * Initializer start priority.
	 *
	 * @type {number}
	 */
	startPriority = 100;

	/**
	 * Initializer stop priority.
	 *
	 * @type {number}
	 */
	stopPriority = 400;

	/**
	 * Initializer loading function.
	 *
	 * @param api   API reference.
	 */
	async load(api) {
		api.models = new Models(api);
	}

	/**
	 * Initializer start function.
	 *
	 * @param api   API reference.
	 */
	async start(api) {
		await api.models.createNewInstance();
	}

	/**
	 * Initializer stop function.
	 *
	 * @param api   API reference.
	 */
	async stop(api) {
		await api.models.finish();
	}
}
