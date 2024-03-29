NODEMON := $(shell command -v nodemon 2> /dev/null)

all: clear first run
run: network server
dev: network server populate

first: node_modules
	cp -n dummy-secure-config.json secure-config.json
	cp -n dummy-config.json config.json

network:
	cd fabric && ./start.sh

populate:
	node util/populate.js

server:
ifndef NODEMON
	npm start
endif
	nodemon start

node_modules:
	npm i

clear:
	rm -rf fabric/hfc-key-store

