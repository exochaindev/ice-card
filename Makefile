NODEMON := $(shell command -v nodemon 2> /dev/null)

all: network server

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

