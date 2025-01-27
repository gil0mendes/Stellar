exports.render = (data) => `
'use strict'

exports.${data.taskName} = {
  name: '${data.taskName}',
  description: 'Change this to describe your task',

  queue: 'default',
  frequency: 1000,

  run (api, param) {
    // do stuff...
  }
}
`;
