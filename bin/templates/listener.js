exports.render = (data) => `
'use strict'

exports.default = {
  event: '${data.name}',
  description: 'This was automatically generated',

  run (api, params) {
    // TODO - implement the listener behavior
  }
}
`;
