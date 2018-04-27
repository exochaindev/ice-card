'use strict';

var express = require('express');
var router = express.Router();
const model = require('../model/index.js');
// TODO: I installed gfycat-style-urls
// I might prefer that one, actually
// var model = require('model/index.js')

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('make-card', {  });
});

router.post('/', function(req, res, next) {
  // Make the card, store it on blockchain, etc.
  model.addCard(req.body).then((id) => {
    res.redirect('/' + id);
  });
});

// Sometimes I want to test my code from the web because it's an easy entrypoint
router.get('/debug', function(req, res, next) {
  // Debug the things
  model.getCars().then((cars) => {
    res.render('debug', { debugString: cars });
  }, (err) => {
    res.render('debug', { debugString: "Typical, the debug failed:\n" + err });
  });
});

// Actually more than sometimes
router.get('/debug/:id', function(req, res, next) {
  if (req.params.id == 0) {
    var data = {
      "name": "This is me",
      "email": "aoetuh@aetuh.oneta",
      "phone": "394 394 5029",
      "address": "54 Waddling Street",
    };
    model.addCard(data).then(() => {
      res.render('debug', { debugString: 'Added your card (?)' });
    }, (err) => {
      res.render('debug', { debugString: "Error:\n" + err});
    });
  }
});

router.get('/:uid', function(req, res, next) {
  // Get the card from the model etc
  model.getCard(req.params.uid).then((contacts) => {
    res.render('view-card', { contacts: contacts });
  }, (err) => {
    res.render('debug', { debugString: "Error:\n" + err });
  });
});

module.exports = router;

