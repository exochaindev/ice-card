'use strict';

const express = require('express');
const model = require('../model/index.js');
const c = require('./common.js');
const qr = require('qr-image');

var router = express.Router();

router.get('/', async function(req, res, next) {
  let card = {};
  if (req.query.referrer) {
    card = await model.referrerCard(req.query.referrer, req.query.contact);
    if (card) {
      card = card.contacts;
    }
  }
  res.render('make-card', { existing: card });
});

router.post('/', function(req, res, next) {
  // Make the card, store it on blockchain, etc.
  let card = model.parseCard(req.body);
  model.addCard(card).then((id) => {
    res.redirect(model.getPrintUrl(id));
  });
});

router.get('/:uid', c.needsCard);
router.get('/:uid/print', c.needsCard);

router.get('/:uid', function(req, res, next) {
  let canAddSecure = model.secure.canAddSecure(req.card);
  let url = model.getCardUrl(req.uid);
  if (req.card.deactivated) {
    res.send('You deactivated this card. <a href="/' + req.uid + '/activate">Activate</a>.') // TODO
    next();
  }
  res.render('view-card', {
    card: req.card,
    canAddSecure: canAddSecure,
    url: url,
  });
  model.onScan(req.card, req);
});
router.get('/:uid/print', function(req, res, next) {
  let uid = req.uid;
  // On printed card, urls should be absolute url
  let url = model.getCardUrl(uid, true);
  let cardUrl = model.getCardUrl(uid);
  let qrUrl = model.getQrUrl(uid);
  res.render('print-card', {
    contacts: req.card.contacts,
    url: url,
    qrUrl: qrUrl,
    cardUrl: cardUrl,
  });
});

router.get('/:uid/qr.:ext', function(req, res, next) {
  let uid = req.uid;
  let url = model.getCardUrl(uid, true, true);
  let qrSvg = qr.image(url, {
    type: req.params.ext,
    size: 6,
    margin: 0,
  });
  qrSvg.pipe(res);
});

module.exports = router;

