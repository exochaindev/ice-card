'use strict';

const app = require('../app.js')
const idGen = require('human-readable-ids').hri;
// TODO: I installed gfycat-style-urls
// I might prefer that one, actually
const fabric = require('./fabric.js');
const secure = require('./secure.js');
const email = require('./email.js');

const cfg = require('../config.json');

const cmpString = require('string-similarity').compareTwoStrings;

const canonicalDomain = cfg.canonicalDomain;
const protocol = 'http://';

// Take the output from make-card and turn it into a structured card object
// This is unfortunately necessary to have nice structured data
// because HTML forms don't support structured input
function parseCard(form) {
  let card = {};
  card.contacts = {};
  let contacts = card.contacts;
  Object.keys(form).forEach(function(key) {
    let parts = key.split('-');
    let truekey = parts[0];
    let subkey = parts[1];
    let value = form[key];
    if (!contacts[truekey]) {
      contacts[truekey] = {};
    }
    contacts[truekey][subkey] = value;
  });
  return card;
}

function swapEntry(card, one, two) {
  let temp = Object.assign({}, card[one]);
  card[one] = Object.assign({}, card[two]);
  card[two] = temp;
}

function referrerCard(id, type) {
  return getCard(id).then((card) => {
    if (type) {
      // Swap you and [marked as] so your info is filled out
      swapEntry(card.contacts, "you", type); // We should be you
      swapEntry(card.contacts, type, "primary"); // They should be primary
    }
    return card;
  }, (err) => {
    // Fail simply by creating a completely new card
    console.error(err);
    return {};
  });
}

async function initCard(card) {
  // Set expiration date for adding security expiring
  // This is needed so that someone cannot secure an unsecured card and
  // essentially steal it
  let hoursToMs = (
    24 // Hours
    * 60 // Minutes
    * 60 // Seconds
    * 1000 // Ms
  );
  let exp = Date.now() + hoursToMs * cfg.secureExpiresHours;
  card.secureExpires = exp;

  // Every single entry gets initialized with a key, either by the web interface
  // (matched with someone by a human), by a referral (referred entry = you),
  // or by this right here: a new random key.
  // This allows us to connect records, even if they haven't signed up yet.
  for (let entry in card.contacts) {
    if (!card.contacts[entry].key) {
      card.contacts[entry].key = getId();
    }
  }

}

async function addCard(data) {
  await initCard(data);
  let id = data.contacts.you.key;
  var fabricData = [
    id,
    JSON.stringify(data),
  ];
  return fabric.addCard(fabricData).then((response) => {
    // Send viral-factor emails. This helps us complete escrow and gain users
    email.sendCardEmails(data);
    return id; // Need that ID to redirect
  }, (err) => {
    throw 'Could not add card: ' + err
  });
}

function updateCard(card) {
  let id = card.contacts.you.key;
  if (!card.encrypted && card.secure) {
    throw 'Cannot update card, tried to commit unencrypted card!';
  }
  fabric.sendTransaction('updateCard', [id, JSON.stringify(card)]);
}

async function recordAccess(req) {
  let data = {
    'ip': req.ip,
    'ua': req.get('User-Agent'),
    'url': req.originalUrl,
  };
  let accessData = JSON.stringify(data);
  await fabric.recordAccess(accessData);
}

function getCard(id) {
  return fabric.getCard(id).then((card) => {
    return JSON.parse(card);
  }, (err) => {
    // Fail silently. This can be checked, but most of the time, we don't care
    return null;
  });
}

async function getClosestPerson(compareTo) {
  // Because chaincode is a total pain to work with, it's 1000x times easier
  // to nest these, even thought it'd be better for them to be flat in an
  // ideal world

  // Returns a proximity value, between two cards
  // Bounded [0, 23] at the time of this comment, but upper max is mostly
  // arbitrary
  function getProximity(original, check) {
    function precisionDst(one, two, precisionLevel) {
      // Two empty strings should give 0 score, despite cmpString returning 1
      // (they're exactly equal, but nothing is there to equal)
      if (one && two) {
        return Math.pow(cmpString(one, two), precisionLevel);
      }
      else {
        return 0;
      }
    }

    let length = original.name + original.address + original.email + original.phone;
    // If we have less than ~15 characters of data, we can't really compare
    if (length.length < 15) {
      return 0;
    }

    // These have reason, but are essentially arbitrary
    let weights = {
      // Names have a lot of variation in reasonable use (nicknames, etc)
      "name": 1,
      "email": 6,
      "address": 3,
      "phone": 3,
      // If they're referred, we should highly suggest that they are person, but
      // if everything else matches someone better, it should be overridable
      // Total of others = 13 rn, so 10 makes sense
      "referral": 10,
    };
    let proximity = 0;
    // cmpString returns [0, 1] (Dice's Coefficient)
    // Names have a lot of variation in reasonable use
    proximity += weights.name * precisionDst(original.name, check.name, 1);
    // Addresses can be written very different ways
    proximity += weights.address * precisionDst(original.address, check.address, 1);
    // Email addresses should match exactly, essentially
    proximity += weights.email * precisionDst(original.email, check.email, 5);
    // Phone numbers often lack digits, have extra (-)s, etc
    // Plus, a relevant area code may increase score
    proximity += weights.phone * precisionDst(original.phone, check.phone, 0.5);
    if (check.key && original.key) {
      proximity += weights.referral * precisionDst(original.key, check.key, 10);
    }

    let max = 0;
    for (let key in weights) {
      max += weights[key];
    }
    // Normalize to those weights so we can make reasoned statements like
    // if (proximity > 0.9) and se it like a confidence
    proximity = proximity / max;

    return proximity;
  }

  // TODO: This is an extremely naiive / slow way to do this
  // Should probably use indexing and search for exact matches on keys first, etc
  // And only *then* use this exhaustive fuzzy search
  // threshold was selected by tinkering around until it felt right
  let threshold = 0.1;
  let cards = JSON.parse(await fabric.query('queryRange', ['a', 'z']));
  let bestProx = -1;
  let bestKey = '';
  let bestEntry = '';
  for (let key in cards) {
    let card = cards[key].Record.contacts;
    for (let entry in card) {
      let person = card[entry];
      let prox = getProximity(compareTo, person);
      if (prox > bestProx && prox > threshold) {
        bestProx = prox;
        bestKey = key;
        bestEntry = entry;
      }
    }
  }
  if (bestProx == -1) {
    return JSON.stringify({"error": "no relevant users found"});
  }
  return JSON.stringify(cards[bestKey].Record.contacts[bestEntry]);

}

function canAddSecure(card) {
  return card.secureExpires > Date.now();
}
function revokeSecure(id, card) {
  // Don't allow security to be revoke (=data deleted) by just anyone
  if (!card.secure/* || Some nebulous idea of "authenticated" (TODO) */)
  {
    card.secureExpires = 0;
    delete card.secure;
    delete card.encrypted;
    updateCard(card);
  }
}
async function makeSecure(id, card, password) {
  card.secureExpires = 0; // No more making secure / changing password, obviously!
  // The secure field is entirely encrypted, every time with AES. This keeps
  // metadata secure
  card.secure = {};
  // The asymmetric field is for data encrypted with our *public key*
  // This is initially added so that a friend's key can be split and shared
  // without needing us there.
  // This field's fields are not encrypted, but their values are. E.g.:
  // "asymmetric" : {
  //   "keys" : {
  //     "cool-rabbit-12" : "ehtxuntaexn{{RSA encrypted password part}}oent"
  //   }
  // }
  card.asymmetric = {};
  // Generate an RSA keypair to be used when someone else's key is shared
  let keypair = await secure.generateEncryptedKeyPair(password);
  card['publicKey'] = keypair.publicKey;
  card['privateKeyEncrypted'] = keypair.privateKeyEncrypted;

  card['canEscrow'] = true;
  card['hasEscrow'] = false;

  // TODO: To make this query faster, we could store the number escrow in the
  // referring card, and then increment it whenever we secure

  // Check if we complete an escrow capability
  if (card.contacts.you.key) {
    // Our key was explicitly declared (it was found elsewhere), i.e., someone
    // is waiting for us for escrow
    let referringCards = await fabric.getReferringCards(card.contacts.you.key);
    for (let i in referringCards) {
      let escrow = [card];
      let referring = referringCards[i].Record;
      if (referring.encrypted) {
        console.log("referring " + i)
        for (let key in referring.contacts) {
          let entry = referring.contacts[key];
          if (entry.key != card.contacts.you.key) {
            // Here's a person that may or may not be waiting for escrow
            let otherChildCard = await getCard(entry.key);
            console.log("other" + entry.key);
            if (otherChildCard) {
              if (otherChildCard.encrypted) {
                console.log("ye, push it");
                escrow.push(otherChildCard);
              }
            }
          }
        }
        let escrowNeeded = 3; // TODO: This should be configurable!!
        if (escrow.length > escrowNeeded) {
          // Now we have a problem. We're ready to do the escrow, but our key
          // isn't stored anywhere. We need to notify the referrer to complete
          // the escrow
          email.sendEscrowFinished(referring);
        }
      }
    }
  }

  // TODO: Check if we can already share our key (requires concept of identity)
  secure.encryptCard(card, password);
  updateCard(card);
}

// If absolute is true, return ice.card/:id or whatever
// Otherwise, return /:id or whatever
function getCardUrl(id, absolute = false, includeProtocol = false) {
  let rv = '';
  if (includeProtocol) {
    rv += protocol;
    absolute = true;
  }
  if (absolute) {
    rv += canonicalDomain;
  }
  rv += '/' + id
  return rv;
}
function getQrUrl(id, absolute = false, incProt = false) {
  return getCardUrl(id, absolute, incProt) + '/qr.svg';
}
function getPrintUrl(id, absolute = false, incProt = false) {
  return getCardUrl(id, absolute, incProt) + '/print'
}
// type is the name of the contact type that this person WAS in the referral
function getReferredUrl(id, type, absolute = false, incProt = false) {
  let rv = '';
  if (incProt) {
    rv += protocol;
  }
  if (absolute) {
    rv += canonicalDomain;
  }
  rv += '/?referrer=' + id;
  if (type) {
    rv += '&contact=' + type;
  }
  return rv;
}

function getId() {
  return idGen.random();
}
// In the moment, punctuation is hard to describe, make room for errors
function sanitizeId(id) {
  return id.replace(/[_ +'"]/g, '-');
}

// Cards
module.exports.parseCard = parseCard;
module.exports.referrerCard = referrerCard;
module.exports.getCard = getCard;
module.exports.getClosestPerson = getClosestPerson;
module.exports.addCard = addCard;
module.exports.updateCard = updateCard;
module.exports.canAddSecure = canAddSecure;

// Urls
module.exports.sanitizeId = sanitizeId;
module.exports.getCardUrl = getCardUrl;
module.exports.getQrUrl = getQrUrl;
module.exports.getPrintUrl = getPrintUrl;
module.exports.getReferredUrl = getReferredUrl;

module.exports.queryAll = fabric.queryAll;
module.exports.recordAccess = recordAccess;

module.exports.secure = secure;
module.exports.makeSecure = makeSecure;
module.exports.revokeSecure = revokeSecure;

module.exports.fabric = fabric;


