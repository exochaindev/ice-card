# All debian-hosted dependencies
sudo apt install curl docker-compose docker golang python
# Node, because debian node is horrible
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
source ~/.bashrc
nvm install 8
nvm use 8
# Hyperledger Fabric binaries
curl -sSL https://goo.gl/6wtTN5 | bash -s 1.1.0
# Install the server requirements, and run
make

