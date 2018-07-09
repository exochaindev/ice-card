'use strict';

const app = require('../app.js')
const idGen = require('gfycat-style-urls');
const fabric = require('./fabric.js');
const secure = require('./secure.js');
const email = require('../routes/email.js');

const cfg = require('../config.json');

const cmpString = require('string-similarity').compareTwoStrings;

const canonicalDomain = cfg.canonicalDomain;
const protocol = 'http://';

// Take the output from make-card and turn it into a structured card object
// This is unfortunately necessary to have nice structured data
// because HTML forms don't support structured input
function parseCard(form) {
  let card = {};
  card.notes = form.notes;
  delete form.notes;
  card.deactivate = form.deactivate == "on";
  delete form.deactivate;
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

// Swap two contacts entries
function swapEntry(contacts, one, two) {
  let temp = Object.assign({}, contacts[one]);
  contacts[one] = Object.assign({}, contacts[two]);
  contacts[two] = temp;
}

var getCard = fabric.getCard;

// A referrer card has the referred's information as "you" and the referrer's
// information as "primary".
// Return a card that looks like that given the ID of the original card and who
// the referred is on that original card (i.e. alternative / etc)
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

// A card needs a lot of properties that don't come from input
// EG: When it can be no longer secured, and new keys for new entries
// Initialize a card IN-PLACE, return nothing
function initCard(card) {
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
    // TODO: Only add key if not empty
    if (!card.contacts[entry].key) {
      card.contacts[entry].key = getId();
    }
  }

}

// INITIALIZE and add a card to the blockchain
// The key is implied by the card data sent
// Returns a promise that resolves with the key ONCE the card has been ADDED
async function addCard(data, sendEmails=true) {
  await initCard(data);
  return fabric.addCard(data).then((response) => {
    if (sendEmails) {
      // Send viral-factor emails. This helps us complete escrow and gain users
      email.sendCardEmails(data);
    }
    return data.contacts.you.key; // Need that ID to redirect
  }, (err) => {
    throw 'Could not add card: ' + err
  });
}

// Given existing card that's on the blockchain, put this new data in it
// Key is implied from card
// Returns a Promise that resolves to null ONCE the card has been UPDATED
async function updateCard(card, keyOverride=null) {
  let key = keyOverride || card.contacts.you.key;
  if (!card.encrypted && card.secure) {
    throw 'Cannot update card, tried to commit unencrypted card!';
  }
  await fabric.updateCard(card, key);
}

// Record the user-agent and other info in the blockchain for security /
// auditing / etc
// Returns a Promise that resolves to null only once access has been recorded
async function recordAccess(req) {
  let data = {
    'ip': req.ip,
    'ua': req.get('User-Agent'),
    'url': req.originalUrl,
  };
  await fabric.recordAccess(data);
}

// Eveery time a card is scanned, there are some things we want to do
// (like log it, and maybe deactivate it)
function onScan(card, req) {
  recordAccess(req);
  if (card.secure && card.deactivate) {
    email.sendDeactivated(card);
    secure.deactivateCard(card);
  }
  else if (card.deactivate) {
    let res = moveId(card);
    let id = res.id;
    email.sendMoved(id, card);
  }
}

// Returns an object:
// {
//   id: the generated ID the card was moved to
//   added: a promise for having added the card so it can be redirected
//   deleted: a promise for when the original card has been removed
//   completed: a promise for *everything* that must happen for this card to be complete
// }
function moveId(card) {
  const newId = getId();
  const oldId = card.contacts.you.key;
  card.contacts.you.key = newId;

  let promises = [];
  let added = addCard(card, false);
  promises.push(added);

  // For every card that refers to us, change the referred id
  let getCardsP = fabric.getReferringCards(oldId)
  promises.push(getCardsP);
  getCardsP.then((referringCards) => {
    // For each card
    for (let referring of referringCards) {
      referring = referring.Record;
      // Because fabric didn't tell us which we have to find it
      for (let type in referring.contacts) {
        let entry = referring.contacts[type];
        if (entry.key == oldId) {
          // Update the key
          entry.key = newId;
          break;
        }
      }
      promises.push(updateCard(referring));
    }
  });

  let deleted = fabric.deleteCard(oldId);

  return {
    id: newId,
    added: added,
    deleted: deleted,
    completed: Promise.all(promises),
  };

}

// Search through every contact ever using fuzzy search to find the closest one
// Returns a promise that resolves to that contact's data once confirmed
async function getClosestPerson(compareTo) {
  // Because chaincode is a total pain to work with, it's 1000x times easier
  // to nest these, even thought it'd be better for them to be flat in an
  // ideal world

  // Returns a proximity value, between two contacts
  // Bounded [0, 1] at the time of this comment, but upper max is mostly
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

// If absolute is true, return ice.card/:id or whatever
// If protocol is true return http://... or whatever
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
// TODO: These start to get pretty complicated to maintain and not worth much.
// Should we remove them?
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

// Generate a unique ID to be used for a contact / card (card ID == contact.you ID)
function getId() {
  return sanitizeId(idGen.generateCombination(2, "-"));
}
// In the moment, punctuation is hard to describe, make room for errors
function sanitizeId(id) {
  let rv = id;
  rv = rv.replace('.json', '');
  rv = rv.replace(/[_ +'"-]+/g, '-');
  rv = rv.toLowerCase()
  return rv;
}

// Cards
module.exports.parseCard = parseCard;
module.exports.referrerCard = referrerCard;
module.exports.getCard = getCard;
module.exports.getClosestPerson = getClosestPerson;
module.exports.addCard = addCard;
module.exports.updateCard = updateCard;

// Urls
module.exports.sanitizeId = sanitizeId;
module.exports.getCardUrl = getCardUrl;
module.exports.getQrUrl = getQrUrl;
module.exports.getPrintUrl = getPrintUrl;
module.exports.getReferredUrl = getReferredUrl;

module.exports.queryAll = fabric.queryAll;
module.exports.onScan = onScan;

module.exports.secure = secure;
module.exports.email = email;
module.exports.fabric = fabric;


