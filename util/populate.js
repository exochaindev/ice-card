const model = require('../model/index.js');
const fs = require('fs');

var secureCount = 3;
var notSecuredCount = secureCount;
var escrowCount = 1;

fs.readFile('./util/test-card.json', 'utf-8', async (err, data) => {
  if (err) {
    throw err;
  }
  let card = JSON.parse(data);
  id = await model.addCard(card);
  for (let entry in card.contacts) {
    if (entry != 'you') {
      model.referrerCard(card.contacts.you.key, entry).then((referred) => {
        model.addCard(referred).then((id) => {
          if (secureCount > 0) {
            model.secure.makeSecure(referred, 'password').then(() => {
              notSecuredCount--;
              if (notSecuredCount == 0 && escrowCount > 0) {
                model.secure.escrow(referred, 'password', 3);
                escrowCount--;
              }
            });
            secureCount--;
          }
        });
      });
    }
  }
});

