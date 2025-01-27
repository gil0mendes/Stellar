exports.render = (data) => `
'use strict'

module.exports = [{
  name: '${data.actionName}',
  description: 'This action was generated using the command line tool',

  inputs: {
    title: {
      required: true,
      validator: 'filled|max:20'
    },
    content: {
      required: true,
      default: 'Default value'
    }
  },

  async run (api, action) {
    // put the input parameters on the response object
    action.response.inputtedData = action.params
  }
}]
`;
