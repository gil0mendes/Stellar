// this receives the API reference in case of the developer needs it
export default (api) => {
	// this must return an object with the modifications.
	//
	// the key correspond to the modifications sections (like actions)
	return {
		// the keys of this hash correspond to the groups, this can correspond to a
		// group defined on the action or you can define it later using the
		// `actions` and `modules` keys, you'll see it in a second.
		actions: {
			// here we are creation a group named 'example'
			example: {
				// once that the 'modTest' action doesn't has a group defined we need to
				// specify that in the `actions` array. All the actions defined in this
				// array will be appended to this group.
				//
				// we also have and action that is part of this group, but we don't need
				// define it here, because the `group` key is defined in it.
				actions: ["modTest"],

				// we can also add all the action of a module to a group, for that we
				// define the `module` array
				modules: ["test2"],

				// the `metadata` is an hash that contains the modifications to be
				// applied to each action that is part of this group
				//
				// In each key we can prefix it with a `+`, who means is to "append to",
				// we can use '-', who means "remove" or when to don't use nothing is an
				// replace operation.
				//
				// The value can also be an function, it will receive the action object,
				// and the correspondent value that we are changing. The return will
				// replace the property under work.
				metadata: {
					// in this case we are add a new property named "modProp" with the
					// value of "OK",
					modProp: "OK",

					"+customProp": ["c"],
					"-customProp2": ["b"],
				},
			},
		},
	};
};
