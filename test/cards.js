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
      assert.equal(rv.notes, 'Notes');
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
      id = await model.addCard(testCard, false);
      assert.ok(id);
    });
    it('should send emails', async function() {
      var success = false;
      // Don't wait to actually add a card
      let revert = model.__set__({
        'fabric.addCard': async () => {},
        'email.sendCardEmails': () => {
          success = true;
        }
      });
      // Deep copy and run
      await model.addCard(JSON.parse(JSON.stringify(testCard)));
      assert.ok(success);
      revert();
    });
    it('should not add keys to contacts without data', async function() {
      // Don't wait to actually add a card
      let revert = model.__set__({
        'fabric.addCard': async (card) => {},
        'email.sendCardEmails': () => {}
      });
      // Deep copy and run
      let emptyContact = {
        email: '',
        address: '',
        name: '',
        phone: '',
      };
      let emptyCard = JSON.parse(JSON.stringify(testCard));
      emptyCard.contacts.primary = emptyContact;
      await model.addCard(emptyCard);
      assert.ok(!emptyCard.contacts.primary.key);
      revert();
    })
  });
  describe('#getCard()', function() {
    it('should be able to get added cards (may be `addCard` error!)', async function() {
      let card = await model.getCard(id);
      assert.deepEqual(testCard, card);
    });
  });
  describe('#deleteCard()', async function() {
    it('should make the card go away', async function() {
      this.timeout(5000);
      let toAdd = JSON.parse(JSON.stringify(testCard));
      let deleteId = await model.addCard(toAdd, false);
      await model.fabric.deleteCard(deleteId);
      let deletedCard = await model.getCard(deleteId);
      assert.ok(!deletedCard);
    });
  });
  describe('#moveId()', function() {
    var newId;
    var added;
    var completed;
    it('should return an id and two promises', function() {
      let deepCopy = JSON.parse(JSON.stringify(testCard));
      let res = model.__get__('moveId')(deepCopy);
      newId = res.id;
      added = res.added;
      completed = res.completed;
    });
    it('should place a nearly identical card in the new id', async function() {
      this.timeout(5000);
      // Wait for the card to complete
      await added;
      let card = await model.getCard(newId);
      assert.ok(card);
      // We know the key will have changed
      card.contacts.you.key = testCard.contacts.you.key;
      // We know the secureExpires has changed
      card.secureExpires = testCard.secureExpires;
      assert.deepEqual(card, testCard);
    });
    it('should delete the old card', async function() {
      let oldCard = await model.getCard(id);
      assert.ok(!oldCard);
    });
    it('should change all referrals', async function() {
      // Wait for all cards to be updated
      await completed;
      let referrals = await model.fabric.getReferringCards(id);
      assert.equal(referrals.length, 0);
    })
  });
});
