'use strict';

const express = require('express');
const model = require('../model/index.js');

var router = express.Router();

function needsCard(req, res, next) {
  function error(err) {
    let rv = {
      "error": err.toString(),
    };
    res.status(404).json(rv);
    next();
  }
  model.getCard(req.uid).then((card) => {
    if (!card) {
      error(new Error('Card does not exist'));
    }
    req.card = card;
    next();
  }, (err) => {
    error(err);
  });
}

router.all('/:uid*', function(req, res, next) {
  req.uid = model.sanitizeId(req.params.uid);
  next();
});

module.exports = {
  needsCard: needsCard,
  router: router,
}

