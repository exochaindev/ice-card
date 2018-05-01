'use strict';

var express = require('express');
var router = express.Router();
const model = require('../model/index.js');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('make-card', {  });
});

router.post('/', function(req, res, next) {
  // Make the card, store it on blockchain, etc.
  let card = model.parseCard(req.body);
  model.addCard(card).then((id) => {
    res.redirect('/' + id);
  });
});

router.get('/:uid', function(req, res, next) {
  let uid = model.sanitizeId(req.params.uid);
  model.getCard(uid).then((contacts) => {
    res.render('view-card', { contacts: contacts });
  }, (err) => {
    res.render('debug', { debugString: "Error:\n" + err });
  });
});

module.exports = router;

