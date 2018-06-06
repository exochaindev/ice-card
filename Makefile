NODEMON := $(shell command -v nodemon 2> /dev/null)

all: first run

run: network server

first:
	npm i
	cp -i dummy-secure-config.json secure-config.json

dev: network server
	node util/populate.js

network:
	cd fabric && ./start.sh

server: node_modules
ifndef NODEMON
	npm start
endif
	nodemon start

node_modules:
	npm i

