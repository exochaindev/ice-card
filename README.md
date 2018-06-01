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
 - [fabric-samples](https://hyperledger-fabric.readthedocs.io/en/release-1.1/samples.html).
   This dependency is hanging by a string; I'm working on removing it right now
 - A shell (bash/etc). I have no idea how you would run this on Windows / etc

## Building

    git clone https://github.com/exochaindev/ice-card.git
    make

If you've figured out how to make docker-compose work without root, you can go
into the shell files and remove the `sudo`s, otherwise you'll need root.

I also recommend [nodemon](https://github.com/remy/nodemon) for auto-reload.
The Makefile will detect it and use it if you have it.

