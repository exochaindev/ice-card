'use strict';

const model = require('./index.js');
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
  send: true,
});

function sendCardEmails(card) {
  let contacts = card.contacts;
  let id = card.contacts.you.key;
  console.log(id);
  for (let entry in contacts) {
    let address = contacts[entry].email;
    let url = model.getReferredUrl(id, entry);
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

function sendEscrotFinished(card) {
  console.error("Not implemented");
}

module.exports = {
  sendCardEmails: sendCardEmails,
}

