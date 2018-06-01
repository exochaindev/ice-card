const model = require('../model/index.js');
const fs = require('fs');

var secureCount = 3;

fs.readFile('./util/test-card.json', 'utf-8', async (err, data) => {
  if (err) {
    throw err;
  }
  let card = JSON.parse(data);
  id = await model.addCard(card);
  console.log(id);
  console.log('http://' + model.getCardUrl(id, true));
  for (let entry in card.contacts) {
    if (entry != 'you') {
      model.referrerCard(card.contacts.you.key, entry).then((referred) => {
	model.addCard(referred).then((id) => {
	  if (secureCount > 0) {
	    model.makeSecure(referred, 'password');
	    secureCount--;
	  }
	});
      });
    }
  }
});

