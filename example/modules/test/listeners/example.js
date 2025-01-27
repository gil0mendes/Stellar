/**
 * This is just an example to show the usage of a listener.
 */
export const example = {
	event: "example",
	run(api, params) {
		// change the param value to 'thisIsATest'
		params.value = "thisIsATest";
	},
};
