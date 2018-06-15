const assert = require('assert');
const request = require('supertest');

const server = require('../bin/www');

const model = require('../model/index.js')
const testCard = require('../util/test-card.json');

var uid;

describe('GET', function() {
  before(async function() {
    this.timeout(6000);
    uid = await model.addCard(testCard, false);
  });
  describe('/', function(done) {
    it('should 200', function() {
      request(server)
        .get('/')
        .expect(200, done)
    });
  });
  describe('/:uid/activate', function() {
    it('should 200', function(done) {
      request(server)
        .get('/' + uid + '/activate')
        .expect(200, done)
    });
  });
});

describe('POST', function() {
  describe('/:uid/make-secure', function() {
    it('should 200', function(done) {
      request(server)
        .post('/' + uid + '/make-secure')
        .send({password: 'password'})
        .expect(200, done)
    });
  });
  describe('/:uid/activate', function() {
    before(async function() {
      // TODO: Figure out how to not have to do this mess
      // We don't know when makeSecure has finished because /make-secure responds immediately
      this.timeout(10000);
      let card = await model.getCard(uid);
      await model.secure.makeSecure(card, 'password');
      await model.secure.deactivateCard(card);
    });
    it('should 200', function(done) {
      request(server)
        .post('/' + uid + '/activate')
        .send({password: 'password'})
        .expect(200, done)
    });
  });
});

describe('Clean up', function() {
  it('should clean up successfully', function() {
    server.close();
  });
});

