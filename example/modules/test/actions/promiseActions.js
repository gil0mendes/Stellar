export const promiseAction = {
	name: "promiseAction",
	description: `This uses a promise to finish the action execution instead of a
    callback`,

	run(api, action) {
		return new Promise((resolve) => {
			setTimeout(() => {
				action.response.success = `It's working!`;
				resolve();
			}, 20);
		});
	},
};

export const internalCallPromise = {
	name: "internalCallPromise",
	description: `This calls another action and return a promise`,

	run(api, action) {
		return api.actions
			.call("formattedSum", { a: 4, b: 5 })
			.then(({ formatted }) => {
				action.response.result = formatted;
			});
	},
};

export const errorPromiseAction = {
	name: "errorPromiseAction",
	description: `The action throw an Error to check if the Action Processor can
    handle with it`,

	run(api, action) {
		return api.actions.call("promiseAction").then((_) => {
			throw new Error(`This is an error`);
		});
	},
};
