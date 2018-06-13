/*
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
*/

'use strict';
const shim = require('fabric-shim');
const util = require('util');

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

  // Get all cards with contacts that have an id that corresponds to args[0]
  async getReferringCards(stub, args) {

    let id = args[0];

    [
      {key: id}
    ]

    let query = {
      selector: {
        contacts: {
          "$or": [
            {     primary: {key:id} },
            { alternative: {key:id} },
            { contingency: {key:id} },
            {   emergency: {key:id} },
          ]
        }
      }
    };

    let queryString = JSON.stringify(query);

    let iterator = await stub.getQueryResult(queryString);

    // This should be in a function because it duplicates queryRange
    // BUT fabric makes this a TOTAL PAIN so I'm gonna leave it this way unless
    // I have to change it
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

  async deleteCard(stub, args) {
    stub.deleteState(args[0]);
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

  async recordAccess(stub, args) {
    let id = Date.now().toString()
    await stub.putState(id, Buffer.from(args[0]));
  }

};

shim.start(new Chaincode());
