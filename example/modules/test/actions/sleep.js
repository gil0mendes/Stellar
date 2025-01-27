export const sleep = {
	name: "sleep",
	description: "This action sleep for a while and then return",

	inputs: {
		sleepDuration: {
			required: true,
			default: 1000,
		},
	},

	outputExample: {
		sleepStarted: 1457265602,
		sleepEnded: 1457265615,
		sleepDelta: 13,
		sleepDuration: 10,
	},

	run(_api, data) {
		const sleepDuration = data.params.sleepDuration;
		const sleepStarted = new Date().getTime();

		return new Promise((resolve) => {
			setTimeout(() => {
				const sleepEnded = new Date().getTime();
				const sleepDelta = sleepEnded - sleepStarted;

				data.response.sleepStarted = sleepStarted;
				data.response.sleepEnded = sleepEnded;
				data.response.sleepDelta = sleepDelta;
				data.response.sleepDuration = sleepDuration;

				resolve();
			}, sleepDuration);
		});
	},
};
