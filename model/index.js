'use strict';

const idGen = require('human-readable-ids').hri;
// TODO: I installed gfycat-style-urls
// I might prefer that one, actually
const fabric = require('./fabric.js');

var canonicalDomain = 'localhost:3000';

// Take the output from make-card and turn it into a structured card object
// This is unfortunately necessary to have nice structured data
// because HTML forms don't support structured input
function parseCard(form) {
  let card = {};
  Object.keys(form).forEach(function(key) {
    let parts = key.split('-');
    let truekey = parts[0];
    let subkey = parts[1];
    let value = form[key];
    if (!card[truekey]) {
      card[truekey] = {};
    }
    card[truekey][subkey] = value;
  });
  return card;
}

function addCard(data) {
  var fabricData = [
    getId(),
    JSON.stringify(data),
  ];
  return fabric.addCard(fabricData).then((response) => {
    return fabricData[0]; // Need that ID
  }, (err) => {
    throw 'Could not add card.'
  });
}

function getCard(id) {
  return fabric.getCard(id).then((card) => {
    return JSON.parse(card);
  }, (err) => {
    throw err;
  });
}

function getId() {
  return idGen.random();
}
// In the moment, punctuation is hard to describe, make room for errors
function sanitizeId(id) {
  return id.replace(/[_ +'"]/g, '-');
}

module.exports.queryAll = fabric.queryAll;
module.exports.parseCard = parseCard;
module.exports.addCard = addCard;
module.exports.getCard = getCard;
module.exports.sanitizeId = sanitizeId;

