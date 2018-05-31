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
  console.log(id);
  let intoCards = await model.getSecuredContacts(card.contacts);
  console.log(intoCards);
  let passwordHex = secrets.str2hex(password);
  let shares = secrets.share(passwordHex, intoCards.length, needed);
  for (let i in intoCards) {
    let into = intoCards[i];
    let share = shares[i];
    if (!into.asymmetric.escrow) {
      into.asymmetric.escrow = {};
    }
    console.log(share);
    addAsymmetric(into, into.asymmetric.escrow, id, share);
    model.updateCard(into);
  }
}

module.exports = {
  encryptCard: encryptCard,
  decryptCard: decryptCard,
  generateEncryptedKeyPair: generateEncryptedKeyPair,
  escrow: escrow,
};

