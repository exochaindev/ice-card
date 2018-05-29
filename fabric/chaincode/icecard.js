/*
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
*/

'use strict';
const shim = require('fabric-shim');
const util = require('util');
const cmpString = require('string-similarity').compareTwoStrings;

let Chaincode = class {

  // The Init method is called when the Smart Contract 'fabcar' is instantiated by the blockchain network
  // Best practice is to have any Ledger initialization in separate function -- see initLedger()
  async Init(stub) {
    console.info('=========== Instantiated fabcar chaincode ===========');
    return shim.success();
  }

  // The Invoke method is called as a result of an application request to run the Smart Contract
  // 'fabcar'. The calling application program has also specified the particular smart contract
  // function to be called, with arguments
  async Invoke(stub) {
    let ret = stub.getFunctionAndParameters();
    console.info(ret);

    let method = this[ret.fcn].bind(this);
    if (!method) {
      console.error('no function of name:' + ret.fcn + ' found');
      throw new Error('Received unknown function ' + ret.fcn + ' invocation');
    }
    try {
      let payload = await method(stub, ret.params);
      return shim.success(payload);
    } catch (err) {
      console.log(err);
      return shim.error(err);
    }
  }

  async getCard(stub, args) {
    if (args.length != 1) {
      throw new Error('Incorrect number of arguments. Expecting human ID ie selfish-rabbit-90');
    }
    let id = args[0];

    return stub.getState(id).then((cardData) => {
      if (!cardData || cardData.toString().length <= 0) {
        console.error("Card " + id + " does not exist");
        throw new Error("Card " + id + ' does not exist: ');
      }
      let card = cardData;
      return card;
    });
  }

  // TODO: Should this be on server instead of fabric?
  async getClosestPerson(stub, args) {

    // Because chaincode is a total pain to work with, it's 1000x times easier
    // to nest these, even thought it'd be better for them to be flat in an
    // ideal world

    // Returns a proximity value, between two cards
    // Bounded [0, 23] at the time of this comment, but upper max is mostly
    // arbitrary
    function getProximity(original, check) {
      function precisionDst(one, two, precisionLevel) {
        return Math.pow(cmpString(one, two), precisionLevel);
      }
      // These have reason, but are essentially arbitrary
      let weights = {
        // Names have a lot of variation in reasonable use (nicknames, etc)
        "name": 1,
        "email": 6,
        "address": 3,
        "phone": 3,
        // If they're referred, we should highly suggest that they are person, but
        // if everything else matches someone better, it should be overridable
        // Total of others = 13 rn, so 10 makes sense
        "referral": 10,
      };
      let proximity = 0;
      // cmpString returns [0, 1] (Dice's Coefficient)
      // Names have a lot of variation in reasonable use
      proximity += weights.name * precisionDst(original.name, check.name, 1);
      // Addresses can be written very different ways
      proximity += weights.address * precisionDst(original.address, check.address, 1);
      // Email addresses should match exactly, essentially
      proximity += weights.email * precisionDst(original.email, check.email, 5);
      // Phone numbers should match exactly, they often share digits without being the same person
      proximity += weights.phone * precisionDst(original.phone, check.phone, 10);
      if (check.key && original.key) {
        proximity += weights.referral * precisionDst(original.key, check.key, 10);
      }
    }

    let compareTo = JSON.parse(args[0]);
    // TODO: This is an extremely naiive / slow way to do this
    // Should probably use indexing and search for exact matches on keys first, etc
    // And only *then* use this exhaustive fuzzy search
    let cards = await stub.invokeChaincode('fabcar', ['queryAllCards']);
    let bestProx = -1;
    let bestKey = '';
    let bestEntry = '';
    for (let key in cards) {
      let card = JSON.parse(cards[key]);
      for (let entry in card) {
        let person = card[entry];
        let prox = getProximity(compareTo, person);
        if (prox > bestProx) {
          bestProx = prox;
          bestKey = key;
          bestEntry = entry;
        }
      }
    }
    return Buffer.from(JSON.stringify(cards[bestKey][bestEntry]));
  }

  async initLedger(stub, args) {
    console.info('============= START : Initialize Ledger ===========');
    // Nothing initial needed
    console.info('============= END : Initialize Ledger ===========');
  }

  async addCard(stub, args) {
    console.info('============= START : Create Car ===========');

    await stub.putState(args[0], Buffer.from(args[1]));
    console.info('============= END : Create Car ===========');
  }

  async queryRange(stub, args) {

    let startKey = args[0];
    let endKey = args[1];

    let iterator = await stub.getStateByRange(startKey, endKey);

    let allResults = [];
    while (true) {
      let res = await iterator.next();

      if (res.value && res.value.value.toString()) {
        let jsonRes = {};
        console.log(res.value.value.toString('utf8'));

        jsonRes.Key = res.value.key;
        try {
          jsonRes.Record = JSON.parse(res.value.value.toString('utf8'));
        } catch (err) {
          console.log(err);
          jsonRes.Record = res.value.value.toString('utf8');
        }
        allResults.push(jsonRes);
      }
      if (res.done) {
        console.log('end of data');
        await iterator.close();
        console.info(allResults);
        return Buffer.from(JSON.stringify(allResults));
      }
    }
  }
  async queryAllCards(stub, args) {
    return await stub.invokeChaincode('fabcar', ['queryRange', 'a', 'z']);
  }
  async queryAll(stub, args) {
    return await stub.invokeChaincode('fabcar', ['queryRange', '0', 'z']);
  }

  async updateCard(stub, args) {
    if (args.length != 2) {
      throw new Error('Incorrect number of arguments. Expecting id and card as JSON');
    }
    await stub.putState(args[0], Buffer.from(args[1]));
  }
};

shim.start(new Chaincode());
