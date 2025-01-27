export const status = {
	name: "isolated.action",
	description: "This is an example of a namespaced action",

	outputExample: {
		success: "ok",
	},

	run: (api, action) => {
		return { success: "ok" };
	},
};
