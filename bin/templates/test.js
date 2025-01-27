exports.render = (_) => `
// var to store the Stellar's API object
let api = null

describe('Your awesome feature', () => {

  before(done => {
    // starts the stellar engine
    engine.start((_, a) => {
      api = a
      done()
    })
  })

  after(done => {
    // stops the Stellar engine
    engine.stop(() => { done() })
  })

  it('basic test', done => {
    (true).should.be.true
    done()
  })

})
`;
