'use strict';

const app = require('../app.js')
const idGen = require('human-readable-ids').hri;
// TODO: I installed gfycat-style-urls
// I might prefer that one, actually
const fabric = require('./fabric.js');
const canonicalDomain = 'localhost:3000'
const protocol = 'http://'

const secureCfg = require('../secure-config.json');

const Email = require('email-templates');

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
  var fabricData = [
    getId(),
    JSON.stringify(data),
  ];
  return fabric.addCard(fabricData).then((response) => {
    return fabricData[0]; // Need that ID
  }, (err) => {
    throw 'Could not add card: ' + err
  });
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

// If absolute is true, return ice.card/:id or whatever
// Otherwise, return /:id or whatever
function getCardUrl(id, absolute = false) {
  let rv = '';
  if (absolute) {
    rv += canonicalDomain;
  }
  rv += '/' + id
  return rv;
}
function getQrUrl(id, absolute = false) {
  return getCardUrl(id, absolute) + '/qr.svg';
}
function getPrintUrl(id, absolute = false) {
  return getCardUrl(id, absolute) + '/print'
}

function getId() {
  return idGen.random();
}
// In the moment, punctuation is hard to describe, make room for errors
function sanitizeId(id) {
  return id.replace(/[_ +'"]/g, '-');
}

function sendCardEmails(card, id) {
  let url = protocol + canonicalDomain + '/';
  for (let entry in card) {
    let address = card[entry].email;
    if (address) {
      if (entry == 'you') {
        email.send({
          template: 'created',
          message: {
            to: address,
          },
          locals: {
            card: card,
            viewUrl: getCardUrl(id),
            printUrl: getPrintUrl(id),
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
module.exports.getCard = getCard;
module.exports.addCard = addCard;

// Urls
module.exports.sanitizeId = sanitizeId;
module.exports.getCardUrl = getCardUrl;
module.exports.getQrUrl = getQrUrl;
module.exports.getPrintUrl = getPrintUrl;

module.exports.queryAll = fabric.queryAll;
module.exports.recordAccess = recordAccess;
module.exports.sendCardEmails = sendCardEmails;

