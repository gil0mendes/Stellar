'use strict'

module.exports = [ {
  name: 'createPost',
  description: 'Create a new post',

  inputs: {
    title: {required: true},
    content: {required: true}
  },

  async run (api, action) {
    const Post = api.models.get('post')

    try {
      action.response.post = await Post.create(action.params).fetch()
    } catch(_) {
      throw 'We can\'t create that resource!'
    }
  }
}, {
  name: 'getPosts',
  description: 'Get all posts',

  async run (api, action) {
    const Post = api.models.get('post')
    action.response.posts = await Post.find({})
  }
},
  {
    name: 'getPost',
    description: 'Get a post',

    inputs: {
      id: {required: true}
    },

    async run (api, action,) {
      const Post = api.models.get('post')
      action.response.post = await Post.findOne({ id: action.params.id }) || null
    }
  } ]
