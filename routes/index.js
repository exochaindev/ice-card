var express = require('express');
var router = express.Router();
const idGen = require('human-readable-ids').hri;
// TODO: I installed gfycat-style-urls
// I might prefer that one, actually
// var model = require('model/index.js')

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('make-card', {  });
});

router.post('/', function(req, res, next) {
  // Make the card, store it on blockchain, etc.
  // For now (TODO)
  var id = idGen.random();
  res.redirect('/' + id)
});

router.get('/:uid', function(req, res, next) {
  // Get the card from the model etc
  // For now (TODO)
  var contacts = [
    {
      "name": "Me Meson",
      "email": "aoetuh@aetuh.oneta",
      "phone": "394 394 5029",
      "address": "54 Waddling Street",
    },
    {
      "name": "Me Meson",
      "email": "aoetuh@aetuh.oneta",
      "phone": "394 394 5029",
      "address": "54 Waddling Street",
    },
    {
      "name": "Me Meson",
      "email": "aoetuh@aetuh.oneta",
      "phone": "394 394 5029",
      "address": "54 Waddling Street",
    },
    {
      "name": "Me Meson",
      "email": "aoetuh@aetuh.oneta",
      "phone": "394 394 5029",
      "address": "54 Waddling Street",
    },
    {
      "name": "Me Meson",
      "email": "aoetuh@aetuh.oneta",
      "phone": "394 394 5029",
      "address": "54 Waddling Street",
    },
  ];
  res.render('view-card', { contacts: contacts })
});

module.exports = router;

