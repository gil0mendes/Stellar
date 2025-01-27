export default {
	name: "test",
	description: "Just to test overwrite protection",

	run(engine, data) {
		// define a response var
		return { string: "overwrite" };
	},
};
