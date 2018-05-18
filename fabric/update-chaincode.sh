#!/bin/bash
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#
# Exit on first error
set -ev

version=`date +%s`

# don't rewrite paths for Windows Git Bash users
export MSYS_NO_PATHCONV=1
LANGUAGE=node
export CC_SRC_PATH=${CC_SRC_PATH:-/opt/gopath/src/github.com}
projectname=${COMPOSE_PROJECT_NAME:-icecard}

sudo docker exec -e "CORE_PEER_LOCALMSPID=Org1MSP" -e "CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp" cli peer chaincode install -n $projectname -v $version -p "$CC_SRC_PATH" -l "$LANGUAGE"
sudo docker exec -e "CORE_PEER_LOCALMSPID=Org1MSP" -e "CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp" cli peer chaincode upgrade -o orderer.example.com:7050 -C mychannel -n $projectname -l "$LANGUAGE" -v $version -c '{"Args":[""]}' -P "OR ('Org1MSP.member','Org2MSP.member')"

