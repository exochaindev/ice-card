'use strict';

var express = require('express');
var router = express.Router();
const model = require('../model/index.js');
const debugCard = require('../util/test-card.json');
const queryString = require('qs');

// Sometimes I want to test my code from the web because it's an easy entrypoint
router.get('/queryAll', function(req, res, next) {
  // Debug the things
  // model.queryAll().then((cars) => {
  model.fabric.query('queryRange', ['a', 'z']).then((cars) => {
    res.json(JSON.parse(cars));
    // let pretty = JSON.stringify(JSON.parse(cars), null, 4);
    // res.render('debug', { debugString: pretty });
  }, (err) => {
    throw err;
    res.status(500).json({ error: err.toString() });
  });
});

router.get('/sendEmail', (req, res, next) => {
  model.sendCardEmails(debugCard);
  res.send('good?');
});

router.get('/queryString', function(req, res, next) {
  let rv = queryString.stringify(debugCard);
  rv += '|||'
  rv += encodeURIComponent(JSON.stringify(debugCard));
  res.send(rv);
});

router.get('/referring/:uid', async function(req, res, next) {
  let rv = await model.fabric.getReferringCards(req.params.uid);
  res.json(rv);
})

module.exports = router;

