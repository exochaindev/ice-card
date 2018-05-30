const model = require('../model/index.js');
const fs = require('fs');

fs.readFile('./util/test-card.json', 'utf-8', async (err, data) => {
  if (err) {
    throw err;
  }
  let card = JSON.parse(data);
  id = await model.addCard(card);
  console.log(id);
  console.log('http://' + model.getCardUrl(id, true));
});

