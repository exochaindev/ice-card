all: network server

dev: network server
	node util/populate.js

network:
	cd fabric && ./startNetwork.sh

server: node_modules
	nodemon start

node_modules:
	npm i

