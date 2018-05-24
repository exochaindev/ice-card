'use strict';

const crypto = require('crypto');
// TODO: Use all forge instead of crypto?
const forge = require('node-forge');

// AES is secure to known-plaintext, which is absolutely critical for:
// - Public encrypted databases
// - JSON
const cipherType = 'aes192';

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
    return keypair.privateKey.encrypt(val);
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
        keypair.privateKeyEncrypted = forge.pki.encryptRsaPrivateKey(privateKey, password);
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
  // decrypts a PEM-formatted, encrypted private key
  rv.privateKey = forge.pki.decryptRsaPrivateKey(privateEncryptedPem, password);
  return rv;
}

module.exports = {
  encryptCard: encryptCard,
  decryptCard: decryptCard,
  generateEncryptedKeyPair: generateEncryptedKeyPair,
};

