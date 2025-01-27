export const randomNumber = {
	name: "randomNumber",
	description: "Generates a random number",

	outputExample: {
		number: 0.40420848364010453,
	},

	run(api, action) {
		const number = Math.random();
		return { number, formattedNumber: `Your random number is ${number}` };
	},
};
