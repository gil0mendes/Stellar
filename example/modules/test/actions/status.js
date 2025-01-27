export const status = {
	name: "status",
	description: "This action returns some basic information about the API",

	outputExample: {
		id: "example",
		stellarVersion: "1.0.0",
		uptime: 10030,
	},

	run(api, data) {
		return {
			id: api.id,
			stellarVersion: api.stellarVersion,
			uptime: new Date().getTime() - api.bootTime,
		};
	},
};
