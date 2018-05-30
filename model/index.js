'use strict';

const app = require('../app.js')
const idGen = require('human-readable-ids').hri;
// TODO: I installed gfycat-style-urls
// I might prefer that one, actually
const fabric = require('./fabric.js');
const secure = require('./secure.js');

const cfg = require('../config.json');
const secureCfg = require('../secure-config.json');

const Email = require('email-templates');

const canonicalDomain = cfg.canonicalDomain;
const protocol = 'http://';

const email = new Email({
  message: {
    from: 'no-reply@' + canonicalDomain,
  },
  transport: {
    host: secureCfg.email.host,
    secureConnection: true,
    port: 465,
    auth: {
      user: secureCfg.email.user,
      pass: secureCfg.email.password,
    },
  },
  views: {
    options: {
      extension: 'ejs',
    },
    root: './views/emails/',
  },
  send: true,
});

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

function initCard(card, id) {
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

  // Each *contact* holds a key as well, that makes users consistent
  card.contacts.you.key = id;
}

function addCard(data) {
  let id = getId();
  initCard(data, id);
  var fabricData = [
    id,
    JSON.stringify(data),
  ];
  return fabric.addCard(fabricData).then((response) => {
    return id; // Need that ID
  }, (err) => {
    throw 'Could not add card: ' + err
  });
}

function updateCard(id, card) {
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
    throw err;
  });
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
    updateCard(id, card);
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
  // TODO: Check if we can already share our key (requires concept of identity)
  secure.encryptCard(card, password);
  updateCard(id, card);
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
function getReferredUrl(id, type) {
  let rv = protocol + canonicalDomain + '/?referrer=' + id;
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

function sendCardEmails(card, id) {
  for (let entry in card) {
    let address = card[entry].email;
    let url = getReferredUrl(id, entry);
    if (address) {
      if (entry == 'you') {
        email.send({
          template: 'created',
          message: {
            to: address,
          },
          locals: {
            card: card,
            viewUrl: getCardUrl(id, true, true),
            printUrl: getPrintUrl(id, true, true),
          },
        });
      }
      else {
        email.send({
          template: 'included',
          message: {
            to: address,
          },
          locals: {
            card: card,
            url: url,
            type: entry,
            siteName: canonicalDomain,
          },
        });
      }
    }
  }
}

// Cards
module.exports.parseCard = parseCard;
module.exports.referrerCard = referrerCard;
module.exports.getCard = getCard;
module.exports.getClosestPerson = fabric.getClosestPerson;
module.exports.addCard = addCard;
module.exports.canAddSecure = canAddSecure;

// Urls
module.exports.sanitizeId = sanitizeId;
module.exports.getCardUrl = getCardUrl;
module.exports.getQrUrl = getQrUrl;
module.exports.getPrintUrl = getPrintUrl;
module.exports.getReferredUrl = getReferredUrl;

module.exports.queryAll = fabric.queryAll;
module.exports.recordAccess = recordAccess;
module.exports.sendCardEmails = sendCardEmails;

module.exports.secure = secure;
module.exports.makeSecure = makeSecure;
module.exports.revokeSecure = revokeSecure;


