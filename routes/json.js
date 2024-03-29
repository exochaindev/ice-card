'use strict';

const express = require('express');
const model = require('../model/index.js');
const c = require('./common.js');

var router = express.Router();

router.post('/closest-person.json', async function(req, res, next) {
  let original = req.body;
  let closest = await model.getClosestPerson(original);
  res.json(closest);
});

router.get('/:uid.json', c.needsCard);
router.post('/:uid/private.json', c.needsCard);
router.post('/:uid/update.json', c.needsCard);

router.get('/:uid.json', function(req, res, next) {
  model.onScan(req.card, req);
  res.json(req.card);
});
router.post('/:uid/private.json', function(req, res, next) {
  try {
    model.secure.decryptCard(req.card, req.body.password);
  }
  catch (e) {
    // Forbidden, wrong password probably
    res.status(403);
    next(new Error('Incorrect password, could not decrypt.'));
    return;
  }
  let all = Object.assign(req.card.secure, req.card.asymmetric);
  res.json(all);
});

router.post('/create.json', function(req, res, next) {
  let card = model.parseCard(req.body);
  // Fix addCard failing to find key
  card.contacts.you = card.contacts.you || {};
  model.addCard(card).then((id) => {
    res.json({id});
  }, (err) => {
    console.error(err);
    throw err;
  });
})
router.post('/:uid/update.json', function(req, res, next) {
  let newCard = model.parseCard(req.body);
  model.updateCard(newCard).then(() => {
    res.json({'success':true});
  });
});

router.use(async function(err, req, res, next) {
  let rv = {error: err.toString()};
  res.json(rv);
});

module.exports = router;

