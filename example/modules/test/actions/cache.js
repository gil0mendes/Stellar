export const cacheTest = {
	name: "cacheTest",
	description: "I will test the internal cache function of the API",

	inputs: {
		key: {
			description: "Key to store",
			required: true,
		},
		value: {
			description: "Value to store",
			required: true,
		},
	},

	async run(api, { params, response }) {
		const key = "cache_test_" + params.key;

		// create the base response object
		response.cacheTestResults = {};

		// create a new cache entry
		let resp = await api.cache.save(key, params.value, 5000);

		// append the cache response to the request response
		response.cacheTestResults.saveResp = resp;

		// get the cache size
		const numberOfCacheObjects = await api.cache.size();

		// append the cache size to the response object
		response.cacheTestResults.sizeResp = numberOfCacheObjects;

		// load the cache entry
		const { value, expireTimestamp, createdAt, readAt } = await api.cache.load(
			key,
		);

		// append the load response to the request response
		response.cacheTestResults.loadResp = {
			key,
			value,
			expireTimestamp,
			createdAt,
			readAt,
		};

		// try destroy the cache entry
		resp = await api.cache.destroy(key);

		// append the response to the request response
		response.cacheTestResults.deleteResp = resp;
	},
};
