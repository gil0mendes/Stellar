export default {
	get: [
		{ path: "/post", action: "getPosts" },
		{ path: "/post/:id", action: "getPost" },
	],

	post: [{ path: "/post", action: "createPost" }],
};
