# ice-card

> An initial implementation of the ICE Card system with shared key escrow. Using
Express + Hyperledger Fabric

I thought I'd add this to the GitHub because it's sitting on my harddrive alone
and that makes me scared.

## Dependencies

 - Node.js **8** (I recommend [nvm](https://github.com/creationix/nvm), since 8
   is out-of-date) and npm
 - [Hyperledger Fabric](https://hyperledger-fabric.readthedocs.io/en/release-1.1/samples.html#binaries)
   binaries, which have
   [their own dependencies](https://hyperledger-fabric.readthedocs.io/en/release-1.1/prereqs.html)
 - A shell (bash/etc). I have no idea how you would run this on Windows / etc

## Building

    git clone https://github.com/exochaindev/ice-card.git
    make

This will expose the Web app *and the JSON api* to port 3000.

## About the code

It's an Express app with a Web app and a (very limited) JSON API (for the small
mobile app), and it interfaces with Hyperledger Fabric as a DB, though it does
so through a few heavy layers of abstraction I've made such that you could
probably use it without knowing any Fabric.

It's split up more or less into MVC:

 - `model/` holds as much as I can get it to that actually does logic
   - `model/index.js` works with vanilla cards, contacts, constants, and such
   - `model/fabric.js` normalizes the fabric API into something reasonable, but
     doesn't do anything special
   - `model/secure.js` does the non-vanilla card stuff related to the crypto. It
     uses node forge.
 - `routes/` I try to keep dumb, but it can get a little involved sometimes.
   Its job is to be the Controller, it connects routes to views, and calls model
   functions that must be called (i.e. on POST requests).
    - `routes/common.js` holds a few things that need to be used across files
    - `routes/json.js` has all the `.json` APIs
    - `routes/index.js` has most card stuff
    - `routes/secure.js` has the crypto-related routes
    - `routes/debug.js` has utilities that display data conveniently.
       - Often I'll start putting an API here and move it over, so it's often in flux
       - The one consistent route here is `/debug/queryAll` which is *very*
         convenient as it returns every single card in the database as JSON
 - `views/` is all the templates. `views/emails/` has each email template as
   well.

You'll also want to take a look at `config.json` and `secure-config.json`
(created after first run) and tweak those to your desires.

There also a test suite (mocha). Run `npm test`. I've been adding tests for most
significant new functions I've added, but I only added it recently so it's not
100% coverage.

## Other useful things you might want to know about

Try running `node util/populate.js` to fill up some data that might be
useful, go to `/debug/queryAll` to see what it put there. For convenience, you
can start and populate with `make dev`.

Do `make run` instead of `make` and it won't clear the database. Do `make clear`
to clear it any time. (You'll probably have to restart the network though.)

If you've figured out how to make docker-compose work without root, you can go
into the shell files and remove the `sudo`s, otherwise you'll need root.

I also recommend [nodemon](https://github.com/remy/nodemon) for auto-reload.
The Makefile will detect it and use it if you have it.

