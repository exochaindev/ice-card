'use strict';

const idGen = require('human-readable-ids').hri;
const query = require('./fabcar/query-lib.js');
const invoke = require('./fabcar/invoke.js');

// Take the output from make-card and turn it into a structured card object
// This is unfortunately necessary to have nice structured data
// because HTML forms don't support structured input
function parseCard(form) {
  let card = {};
  Object.keys(form).forEach(function(key) {
    let parts = key.split("-");
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
  // Reconstruct this nice pretty javascript object
  // Into an ugly fabric array (names begone)
  var fabricData = [
    getId(),
    JSON.stringify(data),
  ];
  return invoke.addCard(fabricData).then((response) => {
    return fabricData[0]; // Need that ID
  }, (err) => {
    throw "Could not add card."
  });
}

function getCard(id) {
  return query.getCard(id).then((card) => {
    return JSON.parse(card);
  }, (err) => {
    throw err;
  });
}

function getId() {
  return idGen.random();
}

module.exports.getCars = query.getCars;
module.exports.parseCard = parseCard;
module.exports.addCard = addCard;
module.exports.getCard = getCard;

// --- I was writing my own stuff down here but it was too overwhelming
//
// module.exports.getCars = function() { return "test"; };
// const Client = require('fabric-client');
//
// var client;
// var channel;
//
// function init() {
//   var channel_name = 'mychannel';
//   client = new Client();
//   channel = client.newChannel(channel_name);
// }
//
// // var x = "hi, this is x";
//
// function queryChaincode(org, version, value, chaincodeId, t, transientMap) {
//   var client = new Client();
// }
//
// init();
// console.log(channel);
// console.log(client.getUserContext('user1', true));
//
// module.exports = "testing";
//
