'use strict';

const express = require('express');
const model = require('../model/index.js');
const c = require('./common.js');

var router = express.Router();

router.post('/closest-person.json', async function(req, res, next) {
  let original = req.body;
  let closest = await model.getClosestPerson(original);
  res.json(closest);
})

router.get('/:uid.json', c.needsCard);
router.post('/:uid/private.json', c.needsCard);

router.get('/:uid.json', function(req, res, next) {
  model.onScan(req.card, req);
  res.json(req.card);
});
router.post('/:uid/private.json', function(req, res, next) {
  model.secure.decryptCard(req.card, req.body.password);
  let all = Object.assign(req.card.secure, req.card.asymmetric);
  res.json(all);
});

module.exports = router;

