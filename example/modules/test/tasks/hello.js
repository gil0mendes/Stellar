export default {
	name: "sayHello",
	description: "I say hello",

	queue: "default",
	frequency: 1000,

	run(api, params) {
		api.log("Hello! I'm an action greeting you.", "debug");
	},
};
