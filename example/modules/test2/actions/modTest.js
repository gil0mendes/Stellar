export const modModuleTest = {
	name: "modModuleTest",
	description: "This action is used to test if the mod system supports modules",

	outputExample: {
		result: "OK",
	},

	run(api, action) {
		return { result: action.actionTemplate.modProp };
	},
};
