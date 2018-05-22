'use strict';

var express = require('express');
var router = express.Router();
const model = require('../model/index.js');
const qr = require('qr-image');

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

router.get('/:uid.json', function(req, res, next) {
  model.recordAccess(req);
  let uid = model.sanitizeId(req.params.uid);
  model.getCard(uid).then((card) => {
    res.json(card);
  }, (err) => {
    let rv = {
      "err" : err
    };
    res.json(rv);
  });
});
router.get('/:uid', function(req, res, next) {
  model.recordAccess(req);
  let uid = model.sanitizeId(req.params.uid);
  model.getCard(uid).then((contacts) => {
    res.render('view-card', { contacts: contacts });
  }, (err) => {
    res.render('debug', { debugString: 'Error:\n' + err });
  });
});

router.get('/:uid/print', function(req, res, next) {
  let uid = model.sanitizeId(req.params.uid);
  // On printed card, urls should be absolute url
  let url = model.getCardUrl(uid, true);
  let addSecureUrl = model.getCardUrl(uid);
  let qrUrl = model.getQrUrl(uid);
  model.getCard(uid).then((contacts) => {
  res.render('print-card', {
    contacts: req.card,
    url: url,
    qrUrl: qrUrl,
    addSecureUrl: addSecureUrl
  }, (err) => {
    res.render('debug', { debugString: 'Error:\n' + err });
  });
});

router.get('/:uid/make-secure', function(req, res, next) {
  res.render('add-secure', { cannotAdd: false });
});

router.get('/:uid/qr.:ext', function(req, res, next) {
  let uid = model.sanitizeId(req.params.uid);
  let url = model.getCardUrl(uid, true, true);
  let qrSvg = qr.image(url, {
    type: req.params.ext,
    size: 6,
    margin: 0,
  });
  qrSvg.pipe(res);
})

module.exports = router;

