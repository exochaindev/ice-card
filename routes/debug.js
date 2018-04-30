'use strict';

var express = require('express');
var router = express.Router();
const model = require('../model/index.js');

// Sometimes I want to test my code from the web because it's an easy entrypoint
router.get('/queryAll', function(req, res, next) {
  // Debug the things
  model.queryAll().then((cars) => {
    let pretty = JSON.stringify(JSON.parse(cars), null, 4);
    res.render('debug', { debugString: pretty });
  }, (err) => {
    res.render('debug', { debugString: "Typical, the debug failed:\n" + err });
  });
});

module.exports = router;

