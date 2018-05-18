'use strict';

var express = require('express');
var router = express.Router();
const model = require('../model/index.js');
const qr = require('qr-image');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('make-card', {  });
});

router.post('/', function(req, res, next) {
  // Make the card, store it on blockchain, etc.
  let card = model.parseCard(req.body);
  model.addCard(card).then((id) => {
    res.redirect(model.getPrintUrl(id));
  });
  model.sendCardEmails(card);
});

router.get('/:uid.json', function(req, res, next) {
  req.json = true;
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
  let qrUrl = model.getQrUrl(uid);
  model.getCard(uid).then((contacts) => {
    res.render('print-card', { contacts: contacts, url: url, qrUrl: qrUrl });
  }, (err) => {
    res.render('debug', { debugString: 'Error:\n' + err });
  });
});

router.get('/:uid/qr.:ext', function(req, res, next) {
  let uid = model.sanitizeId(req.params.uid);
  let url = model.getCardUrl(uid, true);
  let qrSvg = qr.image(url, {
    type: req.params.ext,
    size: 6,
    margin: 0,
  });
  qrSvg.pipe(res);
})

module.exports = router;

