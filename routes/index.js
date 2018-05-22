'use strict';

var express = require('express');
var router = express.Router();
const model = require('../model/index.js');
const qr = require('qr-image');
const genPass = require('eff-diceware-passphrase');

router.get('/', async function(req, res, next) {
  let card = {};
  if (req.query.referrer) {
    card = await model.referrerCard(req.query.referrer, req.query.contact);
  }
  res.render('make-card', { existing: card });
});

router.post('/', function(req, res, next) {
  // Make the card, store it on blockchain, etc.
  let card = model.parseCard(req.body);
  model.addCard(card).then((id) => {
    res.redirect(model.getPrintUrl(id));
    model.sendCardEmails(card, id);
  });
});

router.all('/:uid*', function(req, res, next) {
  req.uid = model.sanitizeId(req.params.uid);
  next();
});
function needsCard(req, res, next) {
  model.getCard(req.uid).then((card) => {
    req.card = card;
    next();
  }, (err) => {
    let rv = {
      "error" : err,
    };
    res.status(404).json(rv);
    next(); // TODO: Should we next()?
  });
}
router.get('/:uid.json', needsCard);
router.get('/:uid', needsCard);
router.get('/:uid/print', needsCard);
router.all('/:uid/make-secure', needsCard);
router.all('/:uid/revoke-secure', needsCard);

router.get('/:uid.json', function(req, res, next) {
  model.recordAccess(req);
  res.json(req.card);
});
router.get('/:uid', function(req, res, next) {
  model.recordAccess(req);
  let uid = req.uid;
  res.render('view-card', { contacts: req.card });
});
router.get('/:uid/print', function(req, res, next) {
  let uid = req.uid;
  // On printed card, urls should be absolute url
  let url = model.getCardUrl(uid, true);
  let cardUrl = model.getCardUrl(uid);
  let qrUrl = model.getQrUrl(uid);
  res.render('print-card', {
    contacts: req.card,
    url: url,
    qrUrl: qrUrl,
    cardUrl: cardUrl,
  });
});

router.all('/:uid/make-secure', function(req, res, next) {
  let uid = req.uid;
  let card = req.card;
  let can = model.canAddSecure(card);
  if (!can) {
    res.status(403).render('add-secure', {
      cannotAdd: true,
      newCardUrl: model.getReferredUrl(uid),
    });
  }
  req.allowed = can;
  next();
});
router.get('/:uid/make-secure', function(req, res, next) {
  let pass = genPass(4).join(' ');
  let url = model.getCardUrl(req.uid);
  res.render('add-secure', {
    cannotAdd: false,
    recommendPwd: pass,
    url: url,
  });
});
router.post('/:uid/make-secure', function(req, res, next) {
  model.makeSecure(req.uid, req.card, req.body.password);
  res.send("cool, you just did absolutely nothing") // (TODO)
});
router.get('/:uid/revoke-secure', function(req, res, next) {
  model.revokeSecure(req.uid, req.card);
  res.send('Secure access has been revoked.')
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

