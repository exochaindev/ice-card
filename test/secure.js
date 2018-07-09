const assert = require('assert');

const rewire = require('rewire');
const model = rewire('../model/index.js');
const secure = rewire('../model/secure.js');

var testCard = require('../util/test-card.json');

describe('secure', function() {
  describe('#getPassKey', function() {
    it('should get a properly sized key', () => {
      let key = secure.getPassKey('password');
      assert.equal(key.key.length, 128);
    });
  });
  describe('#makeSecure', function() {
    this.timeout(17000);
    this.slow(10000);
    it('should create a recoverable keypair', async function() {
      try {
        await secure.makeSecure(testCard, 'password');
      }
      catch (err) {
        // We don't care about error that could be encryptCard
        console.warn(err);
      }
      let kp = secure.__get__('getKeyPairFromPems')(testCard.publicKey, testCard.privateKeyEncrypted, 'password');
      assert.ok(kp);
    });
    it('should escrow with sufficient friends', async function() {
      // Establish a dummy getSecuredContacts that returns a bunch of cards,
      // meaning we have sufficient friends even though we don't
      await secure.makeSecure(testCard, 'password');
      // Should not escrow with insufficient friends
      assert.ok(!testCard.asymmetric.escrow);
      let revert = secure.__set__('getSecuredContacts', function() {
        let count = 3;
        let rv = [];
        // let contact = {};
        for (let i=0; i<count; i++) {
          rv.push(testCard);
        }
        return rv;
      });
      await secure.makeSecure(testCard, 'password');
      assert.ok(testCard.asymmetric)
      assert.ok(testCard.asymmetric.escrow)
      assert.ok(testCard.asymmetric.escrow[testCard.contacts.you.key]);
      revert();
    })
  });
  var encrypted;
  describe('#encryptCard', function() {
    it('should return something encrypted-like', function() {
      // Dummy decrypt
      let extend = {
        "asymmetric": {
          "test": "thing"
        },
        "secure": {
          "structured": {
            "anyData": "at all"
          }
        }
      }
      testCard = Object.assign(testCard, extend);
      testCard.encrypted = false;
      // Deep copy for checking
      encrypted = JSON.parse(JSON.stringify(testCard));
      secure.encryptCard(encrypted, 'password');
      assert.notDeepEqual(testCard, encrypted);
      assert.ok(encrypted.encrypted);
      assert.notEqual(typeof(encrypted.secure), typeof({}));
    });
  });
  describe('#decryptCard', function() {
    it('should be able to reverse encryption', function() {
      let decrypted = secure.decryptCard(encrypted, 'password');
      assert.deepEqual(testCard, decrypted);
      delete encrypted; // Misleading name; it's actually decrypted
    });
  });
  var originalCard;
  describe('#deactivateCard', function() {
    before(function() {
      // Decrypt the card again, as its state should be
      secure.encryptCard(testCard, 'password')
    });
    this.timeout(5000);
    before(function() {
      originalCard = JSON.parse(JSON.stringify(testCard));
    })
    it('should modify the card without error', async function() {
      await secure.deactivateCard(testCard);
    });
    it('should have the three correct keys', async function() {
      let keys = Object.keys(testCard);
      assert.deepEqual(keys, ['publicKey', 'privateKeyEncrypted', 'deactivated']);
    });
    it('should have the right container types', async function() {
      assert.ok(testCard.privateKeyEncrypted.startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----'))
      assert.ok(testCard.publicKey.startsWith('-----BEGIN PUBLIC KEY-----'));
      assert.ok(testCard.deactivated.startsWith('-----BEGIN PKCS7-----'));
    });
  });
  describe('#activateCard', function() {
    this.timeout(5000);
    it('should restore the card to its former glory', async function() {
      await secure.activateCard(testCard, 'password');
      assert.deepEqual(testCard, originalCard);
    });
  });
});

