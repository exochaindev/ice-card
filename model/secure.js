'use strict';

const crypto = require('crypto');

// AES is secure to known-plaintext, which is absolutely critical for:
// - Public encrypted databases
// - JSON
const cipherType = 'aes192';

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
  const cipher = crypto.createCipher(cipherType, Buffer.from(password));
  let encrypted = cipher.update(plaintextJSON, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  card.secure = encrypted;
  card.encrypted = true;
  return card; // Modifies in place as always, but return it for convenience
}
function decryptCard(card, password) {
  if (!card.encrypted) {
    return card;
  }
  let encryptedJSON = card.secure;
  const cipher = crypto.createDecipher(cipherType, Buffer.from(password));
  let decrypted = cipher.update(encryptedJSON, 'hex', 'utf8');
  decrypted += cipher.final('utf8');
  try {
    card.secure = JSON.parse(decrypted);
  }
  catch (err) {
    throw 'Could not parse card. Most likely reason: invalid password. ' + err
  }
  card.encrypted = false;
  return card; // Modifies in place as always, but return it for convenience
}

module.exports.encryptCard = encryptCard;
module.exports.decryptCard = decryptCard;

