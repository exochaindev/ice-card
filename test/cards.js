// Ok from now on, you write a test for everything you make or break
// But nothing more
const assert = require('assert');

const rewire = require('rewire');
const model = rewire('../model/index.js');

const testCard = require('../util/test-card.json');

describe('model', function() {
  describe('#parseCard()', function() {
    it('should split keys on hyphens', function() {
      let form = {
        'you-name': 'Person',
      }
      let rv = model.parseCard(form).contacts;
      let expected = {
        you: {
          name: 'Person',
        }
      };
      assert.deepEqual(rv, expected);
    });
    it('should read the notes field', function() {
      let form = { notes: 'Notes' };
      let rv = model.parseCard(form);
      // We don't care about contacts right now
      delete rv.contacts;
      let expected = { notes: 'Notes' };
      assert.deepEqual(rv, expected);
    });
  });
  describe('#sanitizeId()', function() {
    it('should not modify generated ids', function() {
      let id = model.__get__('getId')();
      assert.equal(model.sanitizeId(id), id);
    })
    it('should accept uppercased ids', function() {
      assert.equal(model.sanitizeId('TESTING'), 'testing');
    });
    it('should accept incorrect punctuation', function() {
      assert.equal(model.sanitizeId('testing___- +monkey'), 'testing-monkey');
    });
  });
  var id;
  describe('#addCard()', function() {
    it('should return an id', async function() {
      this.timeout(5000);
      id = await model.addCard(testCard);
      assert.ok(id);
    });
  });
  describe('#getCard()', function() {
    // TODO: How do you check for these things?
    it('should be able to get added cards (may be `addCard` error!)', async function() {
      let card = await model.getCard(id);
      assert.deepEqual(testCard, card);
    });
  });
  describe('#deleteCard()', async function() {
    it('should make the card go away', async function() {
      this.timeout(5000);
      let toAdd = JSON.parse(JSON.stringify(testCard));
      let deleteId = await model.addCard(toAdd);
      await model.fabric.deleteCard(deleteId);
      let deletedCard = await model.getCard(deleteId);
      assert.ok(!deletedCard);
    });
  });
});
