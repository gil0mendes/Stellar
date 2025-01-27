export default {
	name: "listenerTest",
	description: "This action tests the event system",

	run(api, action) {
		return api.events
			.fire("example", { value: "prev_value" })
			.then((response) => {
				action.response.res = response;
			});
	},
};

export const multipleListener = {
	name: "multipleListener",
	description: "This is a test for the multiple listeners support",

	run(api, action) {
		return api.events.fire("multiple", { value: "raw" }).then((response) => {
			action.response.result = response;
		});
	},
};
