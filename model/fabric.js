'use strict';
/*
* Copyright IBM Corp All Rights Reserved
*
* SPDX-License-Identifier: Apache-2.0
*/

// This queries and invokes chaincode
// AND provides helper functions that transform the archane array format of
// Fabric arguments into a readable API
// Nonetheless, it performs only database interaction, no logic, so many of its
// methods are further abstracted by model/index.js
// Besides in model/something, you shouldn't probably use this

var Fabric_Client = require('fabric-client');
var path = require('path');
var util = require('util');
var os = require('os');

var chaincodeId = 'icecard';

//
var fabric_client = new Fabric_Client();

// setup the fabric network
var channel = fabric_client.newChannel('mychannel');
var peer = fabric_client.newPeer('grpc://localhost:7051');
channel.addPeer(peer);
// Only needed for invoke:
var order = fabric_client.newOrderer('grpc://localhost:7050')
channel.addOrderer(order);

var store_path = path.join('./fabric/hfc-key-store');
console.log('Store path:'+store_path);
var tx_id = null;

function init() {
  return Fabric_Client.newDefaultKeyValueStore({ path: store_path
  }).then((state_store) => {
    // assign the store to the fabric client
    fabric_client.setStateStore(state_store);
    var crypto_suite = Fabric_Client.newCryptoSuite();
    // use the same location for the state store (where the users' certificate are kept)
    // and the crypto store (where the users' keys are kept)
    var crypto_store = Fabric_Client.newCryptoKeyStore({path: store_path});
    crypto_suite.setCryptoKeyStore(crypto_store);
    fabric_client.setCryptoSuite(crypto_suite);
    return true;
  });
}

function getUser() {
  return init().then(() => {
    // get the enrolled user from persistence, this user will sign all requests
    return fabric_client.getUserContext('user1', true).then((user_from_store) => {
      if (user_from_store && user_from_store.isEnrolled()) {
        return user_from_store;
      } else {
        throw new Error('Failed to get user1.... run registerUser.js');
      }
    });
  });
}

async function query(func, args) {

  let user = await getUser();

  if (!args) {
    args = ['']
  }

  const request = {
    //targets : --- letting this default to the peers assigned to the channel
    chaincodeId: chaincodeId,
    fcn: func,
    args: args
  };

  // send the query proposal to the peer
  let query_responses = await channel.queryByChaincode(request)

  // query_responses could have more than one results if there multiple peers were used as targets
  if (query_responses && query_responses.length == 1) {
    if (query_responses[0] instanceof Error) {
      throw new Error('error from query = ', query_responses[0]);
    } else {
      return query_responses[0].toString();
    }
  } else {
    return null;
  }

}

function queryAll() {
  return query('queryAll');
}
function getCard(id) {
  return query('getCard', [id]).then((card) => {
    if (card) {
      return JSON.parse(card);
    }
    else {
      return null;
    }
  }, (err) => {
    // Fail silently. This can be checked, but most of the time, we don't care
    return null;
  });
}
async function getReferringCards(id) {
  let json = await query('getReferringCards', [id]);
  return JSON.parse(json);
}

async function sendTransaction(func, args) {
  let user = await getUser();
  // get a transaction id object based on the current user assigned to fabric client
  tx_id = fabric_client.newTransactionID();

  // createCar chaincode function - requires 5 args, ex: args: ['CAR12', 'Honda', 'Accord', 'Black', 'Tom'],
  // changeCarOwner chaincode function - requires 2 args , ex: args: ['CAR10', 'Dave'],
  // must send the proposal to endorsing peers
  var request = {
    //targets: let default to the peer assigned to the client
    chaincodeId: chaincodeId,
    fcn: func,
    args: args,
    chainId: 'mychannel',
    txId: tx_id
  };

  // send the transaction proposal to the peers
  let results = await channel.sendTransactionProposal(request);

  var proposalResponses = results[0];
  var proposal = results[1];
  let isProposalGood = false;
  if (proposalResponses && proposalResponses[0].response &&
    proposalResponses[0].response.status === 200) {
    isProposalGood = true;
  } else {
    console.error('Transaction proposal was bad');
  }
  if (isProposalGood) {

    // build up the request for the orderer to have the transaction committed
    var request = {
      proposalResponses: proposalResponses,
      proposal: proposal
    };

    // set the transaction listener and set a timeout of 30 sec
    // if the transaction did not get committed within the timeout period,
    // report a TIMEOUT status
    var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
    var promises = [];

    var sendPromise = channel.sendTransaction(request);
    promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

    // get an eventhub once the fabric client has a user assigned. The user
    // is required bacause the event registration must be signed
    let event_hub = fabric_client.newEventHub();
    event_hub.setPeerAddr('grpc://localhost:7053');

    // using resolve the promise so that result status may be processed
    // under the then clause rather than having the catch clause process
    // the status
    let txPromise = new Promise((resolve, reject) => {
      let handle = setTimeout(() => {
        event_hub.disconnect();
        resolve({event_status : 'TIMEOUT'}); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
      }, 3000);
      event_hub.connect();
      event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
        // this is the callback for transaction event status
        // first some clean up of event listener
        clearTimeout(handle);
        event_hub.unregisterTxEvent(transaction_id_string);
        event_hub.disconnect();

        // now let the application know what happened
        var return_status = {event_status : code, tx_id : transaction_id_string};
        if (code !== 'VALID') {
          console.error('The transaction was invalid, code = ' + code);
          resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
        } else {
          resolve(return_status);
        }
      }, (err) => {
        //this is the callback if something goes wrong with the event registration or processing
        reject(new Error('There was a problem with the eventhub ::'+err));
      });
    });
    promises.push(txPromise);

    return Promise.all(promises).then((results) => {
      // check the results in the order the promises were added to the promise all list
      if (results && results[0] && results[0].status === 'SUCCESS') {
      } else {
        console.error('Failed to order the transaction. Error code: ' + response.status);
      }

      if(results && results[1] && results[1].event_status === 'VALID') {
      } else {
        console.error('Transaction failed to be committed to the ledger due to ::'+results[1].event_status);
      }
    });
  } else {
    console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
    throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
  }
}

async function addCard(card) {
  let id = card.contacts.you.key;
  var fabricData = [
    id,
    JSON.stringify(card),
  ];
  return sendTransaction('addCard', fabricData);
}

// Pass a card or an ID and delete it entirely
async function deleteCard(id) {
  // Accept either id or card
  if (typeof(id) == typeof({})) {
    id = id.contacts.you.key;
  }
  return sendTransaction('deleteCard', [id]);
}

async function updateCard(card, id) {
  return sendTransaction('updateCard', [id, JSON.stringify(card)]);
}

async function recordAccess(accessInfo) {
  return sendTransaction('recordAccess', [JSON.stringify(accessInfo)]);
}

module.exports.query = query;
module.exports.queryAll = queryAll;
module.exports.getCard = getCard;
module.exports.getReferringCards = getReferringCards;
module.exports.addCard = addCard;
module.exports.deleteCard = deleteCard;
module.exports.updateCard = updateCard;
module.exports.recordAccess = recordAccess;
module.exports.sendTransaction = sendTransaction;

