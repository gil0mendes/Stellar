export const versionedAction = {
	name: "versionedAction",
	description: "Is just a dummy action with a version property",
	version: 1,
	run(api, action) {},
};

export const versionedActionV2 = {
	name: "versionedAction",
	description: "Is just a dummy action with a version property",
	version: 2,

	outputExample: {
		news: "new version",
	},

	run(api, action) {
		return { news: "new version" };
	},
};
