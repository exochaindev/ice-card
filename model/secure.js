'use strict';

const crypto = require('crypto');
// TODO: Use all forge instead of crypto?
const forge = require('node-forge');

const model = require('./index.js');
const email = require('../routes/email.js');
const cfg = require('../config.json');

const secrets = require('secrets.js-grempe');

// AES is secure to known-plaintext, which is absolutely critical for:
// - Public encrypted databases
// - JSON
const cipherType = 'aes192';
const passwordHasher = crypto.createHash('sha256');

const secrets = require('secrets.js-grempe');

// This password hash is NOT SAFE. It is NOT A TRADITIONAL PASSWORD HASH The
// password is not used for authentication (because everything is encrypted),
// so it is not merely hashed and compared. In that case I would use bcrypt /
// etc. The password is only hashed to make it harder to crack (read: longer)
// as well as to avoid awkward or dangerous (=re-used) passwords recovered in
// escrow
// TODO: Actually use this
function hashPassword(clear) {
  passwordHasher.update(clear);
  return passwordHasher.digest('hex');
}

// Make a card ready to be secured. This means generating a keypair and putting
// some blank objects
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
        let escrowNeeded = cfg.escrowNeeded; // TODO: This should be configurable in web UI?
        // Why +1: We should be included, but we aren't yet
        let count = escrow.length + 1
        if (count >= escrowNeeded) {
          // Now we have a problem. We're ready to do the escrow, but our key
          // isn't stored anywhere. We need to notify the referrer to complete
          // the escrow
          email.sendEscrowFinished(referring, count);
        }
      }
    }
  }

  encryptCard(card, password);
  // Check if we can already share our key, and do so if we can without input
  let posse = await getSecuredContacts(card.contacts);
  if (posse.length >= cfg.escrowNeeded) {
    escrow(card, password, posse.length);
  }

  await model.updateCard(card);
}

// Convenience for AES symmetric encryption (always uses base64)
function encrypt(plaintext, password) {
  const cipher = crypto.createCipher(cipherType, Buffer.from(password));
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}
// Convenience for AES symmetric decryption (always uses base64)
function decrypt(ciphertext, password) {
  const cipher = crypto.createDecipher(cipherType, Buffer.from(password));
  let decrypted = cipher.update(ciphertext, 'base64', 'utf8');
  decrypted += cipher.final('utf8');
  return decrypted;
}

// Find only leaves (bottom-level values) and sets it to callback(leaf)
function changeLeaves(obj, callback) {
  for (let key in obj) {
    let value = obj[key];
    if (typeof(value) == typeof({})) {
      changeLeaves(value, callback);
    }
    else {
      obj[key] = callback(value);
    }
  }
}

// Encrypt all a card's secret fields
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
  changeLeaves(card.asymmetric, function(val) {
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
    return false;
  }
  let keypair = getKeyPairFromPems(card.publicKey, card.privateKeyEncrypted, password);
  changeLeaves(card.asymmetric, function(val) {
    return decryptAsymmetric(keypair.privateKey, val);
  });
  card.encrypted = false;
  return card; // Modifies in place as always, but return it for convenience
}

// Escrow stuff:
// Actually do the combination given all the cards' with decrypted pieces
function combine(cards, who) {
  let id = who.contacts.you.key;
  let pieces = [];
  for (let i in cards) {
    let card = cards[i];
    pieces.push(card.escrowRecombining[id]);
    // No longer needed
    delete card.escrowRecombining[id];
  }
  return secrets.hex2str(secrets.combine(pieces));
}
// Check if we have the necessary keys to combine
async function checkCombineCompleted(card, who) {
  // Card's decryption hasn't been committed to blockchain yet (and shouldn't be)
  let escrow = [card];
  let whoId = who.contacts.you.key;
  for (let entry in who.contacts) {
    let escrowId = who.contacts[entry].key;
    let escrowCard = await model.getCard(escrowId);
    if (escrowCard.escrowRecombining && escrowCard.escrowRecombining[whoId]) {
      escrow.push(escrowCard);
    }
  }
  if (escrow.length >= cfg.escrowNeeded) {
    return combine(escrow, who);
  }
  return null;
}
// Decrypt a piece of escrow
async function decryptPiece(card, who, password) {
  decryptCard(card, password);
  if (!card.escrowRecombining) {
    card.escrowRecombining = {};
  }
  let whoId = who.contacts.you.key;
  card.escrowRecombining[whoId] = card.asymmetric.escrow[whoId];
  let combined = await checkCombineCompleted(card, who);
  if (!combined) {
    encryptCard(card, password);
    // Don't wait, it can take its time
    model.updateCard(card);
    return null;
  }
  else {
    return combined;
  }
}

// When a card has been read, take ALL the data, encrypt it with the public
// key, and then delete it. The password will be necessary to re-activate it
function deactivateCard(card) {
  let id = card.contacts.you.key;
  let stringified = JSON.stringify(card);
  let kp = getKeyPairFromPems(card.publicKey);
  let backup = encryptAsymmetricMessage(kp.publicKey, stringified)
  // We want to modify in place, so we can't do `card = {}`
  for (let key in card) {
    if (key != 'publicKey' && key != 'privateKeyEncrypted') {
      delete card[key];
    }
  }
  card.deactivated = backup;
  return model.updateCard(card, id);
}
// Decrypt the private key and restore all that backed up data
function activateCard(card, password) {
  let ciphertext = card.deactivated;
  let kp = getKeyPairFromPems(card.publicKey, card.privateKeyEncrypted, password);
  let decrypted = decryptAsymmetricMessage(kp.privateKey, ciphertext);
  let original = JSON.parse(decrypted);
  Object.assign(card, original);
  delete card.deactivated;
  return model.updateCard(card);
}

// Generate a keypair, then encrypt the private one with password
// Returns a Promise with that keypair
async function generateEncryptedKeyPair(password) {
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
        delete keypair.privateKey;
        resolve(keypair);
      }
    });
  });
}
// You don't need all parameters, it's a convenience function to get either or both of them
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

// Convenience function for using asym crypto
function encryptAsymmetric(key, value) {
  return forge.util.encode64(key.encrypt(value));
}
function decryptAsymmetric(key, value) {
  return key.decrypt(forge.util.decode64(value));
}
// Add a leaf to the card.asymmetric object
// Encrypted iff card is encrypted
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
// Long messages don't do well with vanilla RSA, use the complete
// PKCS-7 protocol for those
function encryptAsymmetricMessage(key, plaintext) {
  let p7 = forge.pkcs7.createEnvelopedData();
  let cert = forge.pki.createCertificate();
  cert.publicKey = key;
  p7.addRecipient(cert);
  // set content
  p7.content = forge.util.createBuffer(plaintext);
  // encrypt
  p7.encrypt();
  // convert message to PEM
  return forge.pkcs7.messageToPem(p7);
}
function decryptAsymmetricMessage(key, pem) {
  let p7 = forge.pkcs7.messageFromPem(pem);
  p7.decrypt(p7.recipients[0], key);
  return p7.content;
}

// Given a card and a password, split that password amongst all secured contacts
// Resolves promise to null when done
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

// Check if the ability to add a password to a card has expired
// This has to expire so no-one can troll through cards and steal them
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
// Get all contacts of a card that have enabled security with a password
async function getSecuredContacts(contacts) {
  let rv = [];
  for (let entryKey in contacts) {
    if (entryKey != 'you') {
      let entry = contacts[entryKey];
      let otherChildCard = await model.getCard(entry.key);
      if (otherChildCard) {
        if (otherChildCard.encrypted) {
          rv.push(otherChildCard);
        }
      }
    }
  }
  return rv;
}

module.exports = {
  encryptCard: encryptCard,
  decryptCard: decryptCard,
  deactivateCard: deactivateCard,
  activateCard: activateCard,
  decryptPiece: decryptPiece,
  escrow: escrow,
  makeSecure: makeSecure,
  canAddSecure: canAddSecure,
  revokeSecure: revokeSecure,
};

