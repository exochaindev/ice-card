'use strict';

const express = require('express');
const model = require('../model/index.js');
const c = require('./common.js');
const genPass = require('eff-diceware-passphrase');

var router = express.Router();

router.all('/:uid/make-secure', c.needsCard);
router.all('/:uid/revoke-secure', c.needsCard);
router.all('/:uid/complete-escrow', c.needsCard);
router.all('/:uid/revoke-escrow', c.needsCard);
router.post('/:uid/private', c.needsCard);

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
  model.makeSecure(req.card, req.body.password);
  res.send("cool, you just did absolutely nothing") // (TODO)
});
router.get('/:uid/revoke-secure', function(req, res, next) {
  // TODO: This should require a password
  model.revokeSecure(req.card);
  res.send('Secure access has been revoked.')
});

router.all('/:uid/complete-escrow', function(req, res, next) {
  let can = req.card.canEscrow;
  if (!can) {
	res.status(403).render('complete-escrow', {
	  cannotAdd: true,
	  newCardUrl: model.getReferredUrl(req.params.uid),
	});
  }
  next();
});
router.get('/:uid/complete-escrow', function(req, res, next) {
  // TODO: Check for hasEscrow and talk about it
  let cannotAdd = !req.card.canEscrow;
  res.render('complete-escrow', {
	url: model.getCardUrl(req.params.uid),
	cannotAdd: false,
  });
});
router.post('/:uid/complete-escrow', function(req, res, next) {
  // TODO: Don't hardcode that 3
  model.secure.escrow(req.card, req.body.password, 3);
  // TODO: template
  res.send('Well done!')
});
router.get('/:uid/revoke-escrow', function(req, res, next) {
  let cannotAdd = !req.card.canEscrow;
  res.render('revoke-escrow', {
	url: model.getCardUrl(req.params.uid),
	cannotAdd: cannotAdd,
	newCardUrl: model.getReferredUrl(req.params.uid),
  });
});
router.post('/:uid/revoke-escrow', function(req, res, next) {
  req.card.canEscrow = false;
  model.updateCard(req.card);
  // TODO: template
  res.send('Revoked successfully')
});

router.post('/:uid/private', function(req, res, next) {
  model.secure.decryptCard(req.card, req.body.password);
  let all = Object.assign(req.card.secure, req.card.asymmetric);
  res.render('unstructured', {
    title: 'All private data for ' + req.card.contacts.you.name,
    data: all,
  });
});

module.exports = router;

