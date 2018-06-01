'use strict';

const crypto = require('crypto');
// TODO: Use all forge instead of crypto?
const forge = require('node-forge');

const model = require('./index.js');

// AES is secure to known-plaintext, which is absolutely critical for:
// - Public encrypted databases
// - JSON
const cipherType = 'aes192';

const secrets = require('secrets.js-grempe');

async function makeSecure(card, password) {
  card.secureExpires = 0; // No more making secure / changing password, obviously!
  // The secure field is entirely encrypted, every time with AES. This keeps
  // metadata secure
  card.secure = {};
  // The asymmetric field is for data encrypted with our *public key*
  // This is initially added so that a friend's key can be split and shared
  // without needing us there.
  // This field's fields are not encrypted, but their values are. E.g.:
  // "asymmetric" : {
  //   "escrow" : {
  //     "cool-rabbit-12" : "ehtxuntaexn{{RSA encrypted password part}}oent"
  //     etc
  //   }
  //   etc
  // }
  card.asymmetric = {};
  // Generate an RSA keypair to be used when someone else's key is shared
  // TODO: This should really be Exochain's keypair. Maybe make them make an
  // account / etc
  // Or it could flow the other way, where you make an exo account *from this*
  // since IMO this is the easier flow
  let keypair = await generateEncryptedKeyPair(password);
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
    let referringCards = await model.fabric.getReferringCards(card.contacts.you.key);
    for (let i in referringCards) {
      let referring = referringCards[i].Record;
      if (referring.encrypted) {
        // Alright, we've got somebody who included us, who has a password that
        // could be escrowed
        let escrow = await getSecuredContacts(referring.contacts);
        let escrowNeeded = 3; // TODO: This should be configurable!!
        // Why +1: We should be included, but we aren't yet
        let count = escrow.length + 1
        if (count > escrowNeeded) {
          // Now we have a problem. We're ready to do the escrow, but our key
          // isn't stored anywhere. We need to notify the referrer to complete
          // the escrow
          model.email.sendEscrowFinished(referring, count);
        }
      }
    }
  }

  // TODO: Check if we can already share our key (requires concept of identity)
  encryptCard(card, password);
  model.updateCard(card);
}

function encrypt(plaintext, password) {
  const cipher = crypto.createCipher(cipherType, Buffer.from(password));
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}
function decrypt(ciphertext, password) {
  const cipher = crypto.createDecipher(cipherType, Buffer.from(password));
  let decrypted = cipher.update(ciphertext, 'base64', 'utf8');
  decrypted += cipher.final('utf8');
  return decrypted;
}

// Find only leaves (bottom-level values) and sets it to callback(leaf)
function changeLeaves(obj, callback) {
  for (let key in obj) {
    let value = key;
    if (typeof(value) == typeof({})) {
      changeLeaves(value, callback);
    }
    else {
      obj[key] = callback(value);
    }
  }
}

// card.secure can be in two states:
// 1. an object, which all those secrets in plain
// 2. an encrypted JSON string of all those secrets
// encrypted = true means state 2
// Why the same entry instead of two? Safer against letting data get lost when
// it's not re-encrypted. We assume all writes will include updated data
function encryptCard(card, password) {
  if (card.encrypted) {
    return card;
  }
  let plaintextJSON = JSON.stringify(card.secure);
  card.secure = encrypt(plaintextJSON, password);
  let keypair = getKeyPairFromPems(card.publicKey, card.privateKeyEncrypted, password);
  changeLeaves(card.symmetric, function(val) {
    return encryptAsymmetric(keypair.publicKey, val);
  });
  card.encrypted = true;
  return card; // Modifies in place as always, but return it for convenience
}
function decryptCard(card, password) {
  if (!card.encrypted) {
    return card;
  }
  let encryptedJSON = card.secure;
  let decrypted = decrypt(encryptedJSON, password);
  try {
    card.secure = JSON.parse(decrypted);
  }
  catch (err) {
    throw 'Could not parse card. Most likely reason: invalid password. ' + err
  }
  let keypair = getKeyPairFromPems(card.publicKey, card.privateKeyEncrypted, password);
  changeLeaves(card.symmetric, function(val) {
    return decryptAsymmetric(keypair.privateKey, val);
  });
  card.encrypted = false;
  return card; // Modifies in place as always, but return it for convenience
}

function generateEncryptedKeyPair(password) {
  // I don't know why forge's method doesn't use Promise, but it seems the
  // reasonable thing to do
  return new Promise(function(resolve, reject) {
    // generate an RSA key pair asynchronously (uses web workers if available)
    // use workers: -1 to run a fast core estimator to optimize # of workers
    forge.rsa.generateKeyPair({bits: 2048, workers: -1}, function(err, keypair) {
      if (err) {
        reject(err);
      }
      else {
        // wraps and encrypts a Forge private key and outputs it in PEM format
        keypair.privateKeyEncrypted = forge.pki.encryptRsaPrivateKey(keypair.privateKey, password);
        // Put the public in PEM for JSON storage
        keypair.publicKey = forge.pki.publicKeyToPem(keypair.publicKey);
        // TODO: Delete plaintext private key for code safety? Or does convenience win?
        resolve(keypair);
      }
    });
  });
}
function getKeyPairFromPems(publicPem, privateEncryptedPem, password) {
  let rv = {};
  // convert a PEM-formatted public key to a Forge public key
  rv.publicKey = forge.pki.publicKeyFromPem(publicPem);
  if (password) {
    // decrypts a PEM-formatted, encrypted private key
    rv.privateKey = forge.pki.decryptRsaPrivateKey(privateEncryptedPem, password);
  }
  return rv;
}

function encryptAsymmetric(key, value) {
  return Buffer.from(key.encrypt(value)).toString('base64');
}
function decryptAsymmetric(key, value) {
  return key.decrypt(Buffer.from(val, 'base64')).toString('ascii');
}
function addAsymmetric(card, object, key, value) {
  if (card.encrypted) {
    let keypair = getKeyPairFromPems(card.publicKey);
    let encrypted = encryptAsymmetric(keypair.publicKey, value);
    object[key] = encrypted;
  }
  else {
    // We have the key, it'll be re-encrypted by encryptCard, just set it
    object[key] = value;
  }
}

async function escrow(card, password, needed) {
  let id = card.contacts.you.key;
  let intoCards = await getSecuredContacts(card.contacts);
  let passwordHex = secrets.str2hex(password);
  let shares = secrets.share(passwordHex, intoCards.length, needed);
  for (let i in intoCards) {
    let into = intoCards[i];
    let share = shares[i];
    if (!into.asymmetric.escrow) {
      into.asymmetric.escrow = {};
    }
    addAsymmetric(into, into.asymmetric.escrow, id, share);
    model.updateCard(into);
  }
}

function canAddSecure(card) {
  return card.secureExpires > Date.now();
}
function revokeSecure(card) {
  // Don't allow security to be revoke (=data deleted) by just anyone
  if (!card.secure/* || Some nebulous idea of "authenticated" (TODO) */)
  {
    card.secureExpires = 0;
    delete card.secure;
    delete card.encrypted;
    model.updateCard(card);
  }
}
async function getSecuredContacts(contacts) {
  let rv = [];
  for (let entryKey in contacts) {
    let entry = contacts[entryKey];
    let otherChildCard = await model.getCard(entry.key);
    if (otherChildCard) {
      if (otherChildCard.encrypted) {
        rv.push(otherChildCard);
      }
    }
  }
  return rv;
}

module.exports = {
  encryptCard: encryptCard,
  decryptCard: decryptCard,
  escrow: escrow,
  makeSecure: makeSecure,
  canAddSecure: canAddSecure,
  revokeSecure: revokeSecure,
};

