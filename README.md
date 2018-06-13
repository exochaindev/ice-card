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

## Other useful things you might want to know about

There's a limited test suite! `npm test` (mocha). I've been adding tests
for most significant new functions I've added.

You can also run `node util/populate.js` to fill up some data that might be
useful, go to `/debug/queryAll` to see what it put there. For convenience, you
can start and populate with `make dev`.

The DB doesn't have to be cleared every run. Edit `fabric/startFabric.sh` to
remove `rm -rf ./hfc-key-store` to persist.

If you've figured out how to make docker-compose work without root, you can go
into the shell files and remove the `sudo`s, otherwise you'll need root.

I also recommend [nodemon](https://github.com/remy/nodemon) for auto-reload.
The Makefile will detect it and use it if you have it.

