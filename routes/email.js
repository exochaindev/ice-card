'use strict';

const model = require('./index.js');
const cfg = require('../config.json');
const secureCfg = require('../secure-config.json');

const Email = require('email-templates');

const email = new Email({
  message: {
    from: 'no-reply@' + model.canonicalDomain,
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
  preview: cfg.emailPreviews,
});

function sendCardEmails(card) {
  let contacts = card.contacts;
  let id = contacts.you.key;
  for (let entry in contacts) {
    let address = contacts[entry].email;
    let url = model.getReferredUrl(id, entry, true, true);
    if (address) {
      if (entry == 'you') {
        email.send({
          template: 'created',
          message: {
            to: address,
          },
          locals: {
            card: contacts,
            viewUrl: model.getCardUrl(id, true, true),
            printUrl: model.getPrintUrl(id, true, true),
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
            card: contacts,
            url: url,
            type: entry,
            siteName: model.canonicalDomain,
          },
        });
      }
    }
  }
}

function sendEscrowFinished(card, count) {
  let contacts = card.contacts;
  let id = contacts.you.key;
  let address = contacts.you.email;
  let url = model.getCardUrl(id, true, true);
  email.send({
    template: 'escrow-finished',
    message: {
      to: address,
    },
    locals: {
      url: url,
      count: count,
    },
  });
}

// Because the card's ID is being messed with asyncronously,
// it's better just to pass the new ID in
function sendMoved(newId, card) {
  let address = card.contacts.you.email;
  let url = model.getCardUrl(newId, true, true);
  email.send({
    template: 'moved',
    message: {
      to: address,
    },
    locals: {
      url: url,
      card: card,
    },
  });
}

// TODO: Do abstraction a lot better in this file
function sendDeactivated(card) {
  let id = card.contacts.you.key;
  let address = card.contacts.you.email;
  let url = model.getCardUrl(id, true, true);
  email.send({
    template: 'deactivated',
    message: {
      to: address,
    },
    locals: {
      url: url,
      card: card,
    }
  });
}

module.exports = {
  sendCardEmails: sendCardEmails,
  sendEscrowFinished: sendEscrowFinished,
  sendMoved: sendMoved,
  sendDeactivated: sendDeactivated,
}

