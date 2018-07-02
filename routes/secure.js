'use strict';

const express = require('express');
const genPass = require('eff-diceware-passphrase');

const model = require('../model/index.js');
const c = require('./common.js');
const cfg = require('../config.json');

var router = express.Router();

router.all('/:uid/make-secure', c.needsCard);
router.post('/:uid/activate', c.needsCard);
router.all('/:uid/revoke-secure', c.needsCard);
router.all('/:uid/complete-escrow', c.needsCard);
router.all('/:uid/revoke-escrow', c.needsCard);
router.post('/:uid/private', c.needsCard);
router.post('/:uid/recombine/:target', c.needsCard);

router.all('/:uid/make-secure', function(req, res, next) {
  let uid = req.uid;
  let card = req.card;
  let can = model.secure.canAddSecure(card);
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
  model.secure.makeSecure(req.card, req.body.password);
  res.send('Successfully secured card.') // TODO: Actually flash or render a page
});
router.get('/:uid/revoke-secure', function(req, res, next) {
  if (req.card.secure) {
    // This card has been secured and might have sensitive data
    // To prevent someone from GETting everyone and deleting all data
    // We ask for a password
    res.render('password', {
      button: 'Never secure this card',
      text: 'You are currently <b>revoking the ability to secure this card</b>.',
    });
  }
  else {
    model.secure.revokeSecure(req.card);
    res.send('Secure access has been revoked');
  }
});
router.post('/:uid/revoke-secure', function(req, res, next) {
  if (model.secure.decryptCard(req.card, req.params.password)) {
    model.secure.revokeSecure(req.card);
    res.send('Secure access has been revoked.');
  }
  else {
    res.status(403).send('Incorrect password');
  }
});

router.get('/:uid/activate', function(req, res, next) {
  res.render('password', {
    button: 'Activate card',
    text: 'Your card has been read, now you must re-activate it.',
  });
});
router.post('/:uid/activate', function(req, res, next) {
  model.secure.activateCard(req.card, req.body.password);
  res.send('Card re-activated. No need to print a new one.') // TODO: Flash
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
  // TODO: Get escrow count from web
  model.secure.escrow(req.card, req.body.password, cfg.escrowNeeded);
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
router.post('/:uid/revoke-escrow', async function(req, res, next) {
  req.card.canEscrow = false;
  await model.updateCard(req.card);
  // TODO: template
  res.send('Revoked successfully')
});

router.get('/:uid/private', function(req, res, next) {
  res.render('password', {
    button: 'Unlock',
    text: 'Access your private data.',
  });
})
router.post('/:uid/private', function(req, res, next) {
  model.secure.decryptCard(req.card, req.body.password);
  let all = Object.assign(req.card.secure, req.card.asymmetric);
  res.render('unstructured', {
    title: 'All private data for ' + req.card.contacts.you.name,
    data: all,
  });
});

router.get('/:uid/recombine/:target', async function(req, res, next) {
  let who = await model.getCard(req.params.target);
  res.render('recombine', {
    done: false,
	who: who,
  });
});
router.post('/:uid/recombine/:target', async function(req, res, next) {
  // let password = req.body.password;
  let who = await model.getCard(req.params.target);
  let answer = await model.secure.decryptPiece(req.card, who, req.body.password);
  res.render('recombine', {
    done: true,
    who: who,
    answer: answer,
  });
});

module.exports = router;

