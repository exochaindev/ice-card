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

router.post('/closest-person.json', async function(req, res, next) {
  let original = req.body;
  let closest = await model.getClosestPerson(original);
  res.json(closest);
})

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
router.all('/:uid/complete-escrow', needsCard);
router.all('/:uid/revoke-escrow', needsCard);
router.post('/:uid/private', needsCard);
router.post('/:uid/private.json', needsCard);

router.get('/:uid.json', function(req, res, next) {
  model.recordAccess(req);
  res.json(req.card);
});
router.get('/:uid', function(req, res, next) {
  model.recordAccess(req);
  let canAddSecure = model.canAddSecure(req.card);
  let url = model.getCardUrl(req.uid);
  res.render('view-card', {
    contacts: req.card.contacts,
    uid: req.uid,
    canAddSecure: canAddSecure,
    url: url,
  });
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

router.post('/:uid/private', function(req, res, next) {
  model.secure.decryptCard(req.card, req.body.password);
  let all = Object.assign(req.card.secure, req.card.asymmetric);
  res.render('unstructured', {
    title: 'All private data for ' + req.card.contacts.you.name,
    data: all,
  });
})
router.post('/:uid/private.json', function(req, res, next) {
  model.secure.decryptCard(req.card, req.body.password);
  let all = Object.assign(req.card.secure, req.card.asymmetric);
  res.json(all);
});

module.exports = router;

