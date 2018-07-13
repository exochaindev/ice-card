# All debian-hosted dependencies
# apt-transport-https and on are docker dependencies
sudo apt install curl docker-compose docker golang python make apt-transport-https ca-certificates curl gnupg2 software-properties-common
# Install docker
# Unfortunately the debian docker is insufficient
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo apt-key add -
sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/debian \
   $(lsb_release -cs) \
   stable"
# New repo needs an update
sudo apt-get update
# Docker is all corporate and so we need to do this pain
sudo apt-get install docker-ce
# Node, because debian node is horrible
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
source ~/.bashrc
nvm install 8
nvm use 8
# Nodemon makes life easier
npm install -g nodemon
# Hyperledger Fabric binaries
curl -sSL https://goo.gl/6wtTN5 | bash -s 1.1.0
# Install the server requirements, and run
make

