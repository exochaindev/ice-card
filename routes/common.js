'use strict';

const express = require('express');
const model = require('../model/index.js');

var router = express.Router();

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

router.all('/:uid*', function(req, res, next) {
  req.uid = model.sanitizeId(req.params.uid);
  next();
});

module.exports = {
  needsCard: needsCard,
  router: router,
}

