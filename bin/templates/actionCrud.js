exports.render = (data) => `
'use strict'

// constant with the inputs declaration
const inputsDeclaration = {}

// constant with the edit input declaration
const editInputDeclaration = {
  ...inputsDeclaration,
  id: {
    required: true
  }
}

module.exports = [{
  name: 'create${data.modelNameCapitalize}',
  description: 'Create a new ${data.modelNameCapitalize}',

  inputs: inputsDeclaration,

  async run(api, { params, response }) {
    // create a new entry on the database
    const model = await api.models.get('${data.modelName}')
      .create(params)
    response.${data.modelName} = model
  }
}, {
  name: 'get${data.modelNameCapitalize}s',
  description: 'Get all ${data.modelNameCapitalize}s',

  async run(api, { response }) {
    const resources = await api.models.get('${data.modelName}')
      .find({})

    response.${data.modelName}s = resources
  }
}, {
  name: 'get${data.modelNameCapitalize}',
  description: 'Get a ${data.modelNameCapitalize}',

  inputs: {
    id: { required: true }
  },

  async run(api, { params, response }) {
    // search for the request post on the DB
    const resource = await api.models.get('${data.modelName}')
      .findOneById(params.id)


    if (!resource) {
      throw new Error('There is no resource with that ID')
    }

    response.${data.modelName} = resource
  }
}, {
  name: 'edit${data.modelNameCapitalize}',
  description: 'Edit a ${data.modelNameCapitalize}',

  inputs: editInputDeclaration,

  async run(api, { params, response }) {
    // search for the ${data.modelNameCapitalize} and update it
    const [result] = await api.models.get('${data.modelName}')
      .update({ id: params.id }, params)

    if (!result) {
      throw new Error("There is no resource with that ID")
    }

    response.${data.modelName} = result
  }
}, {
  name: 'remove${data.modelNameCapitalize}',
  description: 'Remove a ${data.modelNameCapitalize}',

  inputs: {
    id: { required: true }
  },

  async run(api, { params }) {
    // search and remove the model
    await api.models.get('${data.modelName}')
      .destroy({ id: params.id })
  }
}]
`;
