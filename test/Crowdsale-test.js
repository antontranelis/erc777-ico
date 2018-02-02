/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const TestRPC = require('ethereumjs-testrpc');
const Web3 = require('web3');
const chai = require('chai');
const BigNumber = require('bignumber.js');
const EIP820 = require('eip820');
const ReferenceToken = require('../build/contracts').ReferenceToken;
const Crowdsale = require('../build/contracts').Crowdsale;
const assert = chai.assert;
chai.use(require('chai-as-promised')).should();

describe('EIP777 Crowdsale Test', () => {
  let testrpc;
  let web3;
  let accounts;
  let crowdsale;
  let inputToken;
  let outputToken;
  let interfaceImplementationRegistry;
  let util;

  before(async () => {
    testrpc = TestRPC.server({
      ws: true,
      gasLimit: 5800000,
      total_accounts: 10, // eslint-disable-line camelcase
    });
    testrpc.listen(8546, '127.0.0.1');

    web3 = new Web3('ws://localhost:8546');
    accounts = await web3.eth.getAccounts();


    interfaceImplementationRegistry = await EIP820.deploy(web3, accounts[0]);
    assert.ok(interfaceImplementationRegistry.$address);
  });

  after(async () => testrpc.close());

  it('should deploy the input token contract', async () => {

    inputToken = await ReferenceToken.new(
      web3,
      'Input Token',
      'IN',
      1
    );
    assert.ok(inputToken.$address);

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    const name = await inputToken.name();
    assert.strictEqual(name, 'Input Token');
    await util.log(`name: ${name}`);

    const symbol = await inputToken.symbol();
    assert.strictEqual(symbol, 'IN');
    await util.log(`symbol: ${symbol}`);

    const granularity = await inputToken.granularity();
    assert.strictEqual(granularity, '1');
    await util.log(`granularity: ${granularity}`);

    await util.assertTotalSupply(0);
  }).timeout(20000);

  it('should deploy the crowdsale contract', async () => {
    var block = await web3.eth.getBlock(await web3.eth.getBlockNumber()); // one second in the future
    const timestamp = block.timestamp;

      crowdsale = await Crowdsale.new(
        web3,
        timestamp + 1, // 1 second in the future
        timestamp + 4, // expire after 5 seconds
        1000,
        accounts[2],
        inputToken.$address
      );

    assert.ok(crowdsale.$address);
    outputToken = new ReferenceToken(web3, await crowdsale.outputToken());

    await util.getBlock();

    const startTime = await crowdsale.startTime();
    assert.equal(startTime, timestamp + 1);
    await util.log(`startTime: ${startTime}`);

    const endTime = await crowdsale.endTime();
    assert.equal(endTime, timestamp + 4);
    await util.log(`endTime: ${endTime}`);

    const rate = await crowdsale.rate();
    assert.strictEqual(rate, '1000');
    await util.log(`rate: ${rate}`);

    const wallet = await crowdsale.wallet();
    assert.strictEqual(wallet, accounts[2]);
    await util.log(`wallet: ${wallet}`);

    const inputTokenAddress = await crowdsale.inputToken();
    assert.strictEqual(inputTokenAddress, inputToken.$address);
    await util.log(`inputToken: ${inputTokenAddress}`);

  }).timeout(20000);

  it('should mint 10 IN for addr 1', async () => {
    await inputToken.ownerMint(accounts[1], web3.utils.toWei('10'), '0x', {
      gas: 300000,
      from: accounts[0],
    });

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 10);
  }).timeout(6000);

  it('should buy OUT by sending 5 IN to crowdsale contract', async () => {
    await inputToken.send(crowdsale.$address, web3.utils.toWei('5'), '0x', {
      gas: 300000,
      from: accounts[1],
    });

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 5);
    await util.assertBalance(accounts[2], 5);

    util = require('./util')(web3, outputToken);
    await util.assertTotalSupply(5000);
    await util.assertBalance(accounts[1], 5000);
  }).timeout(6000);
/*
  it('should not buy OUT after crowdsale expired', async () => {

    var crowdsaleExpired = await crowdsale.hasEnded();
    while (!crowdsaleExpired) {
      await util.getBlock;
      crowdsaleExpired = await crowdsale.hasEnded();
      console.log(crowdsaleExpired);
    }

    await inputToken.send(crowdsale.$address, web3.utils.toWei('5'), '0x', {
      gas: 300000,
      from: accounts[1],
    });

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 5);
    await util.assertBalance(accounts[2], 5);

    util = require('./util')(web3, outputToken);
    await util.assertTotalSupply(5000);
    await util.assertBalance(accounts[1], 5000);
  }).timeout(10000);
*/

});
