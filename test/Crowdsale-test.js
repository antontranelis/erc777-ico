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

    web3.extend({
      methods: [{
        name: 'increaseTime',
        call: 'evm_increaseTime',
        params: 1
      }]
    });


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
    var block = await web3.eth.getBlock(await web3.eth.getBlockNumber());
    const timestamp = block.timestamp;

      crowdsale = await Crowdsale.new(
        web3,
        timestamp + 10, // 10 seconds in the future
        timestamp + 3600, // expire after 1 hour
        1000,
        accounts[2],
        inputToken.$address
      );

    assert.ok(crowdsale.$address);
    outputToken = new ReferenceToken(web3, await crowdsale.outputToken());

    await util.getBlock();

    const startTime = await crowdsale.startTime();
    assert.equal(startTime, timestamp + 10);
    await util.log(`startTime: ${startTime}`);

    const endTime = await crowdsale.endTime();
    assert.equal(endTime, timestamp + 3600);
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
    await inputToken.mint(accounts[1], web3.utils.toWei('10'), '0x', {
      gas: 300000,
      from: accounts[0],
    });

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 10);
  }).timeout(6000);

  it('should not buy OUT before crowdsale start', async () => {
    await inputToken.send(crowdsale.$address, web3.utils.toWei('5'), '0x', {
      gas: 300000,
      from: accounts[1],
    }).should.be.rejectedWith('invalid opcode');

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    var block = await web3.eth.getBlock(await web3.eth.getBlockNumber());
    const timestamp = Number(block.timestamp);
    const startTime = Number(await crowdsale.startTime());
    assert.isBelow(timestamp, startTime);

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 10);

    util = require('./util')(web3, outputToken);
    await util.assertTotalSupply(0);
    await util.assertBalance(accounts[1], 0);
  }).timeout(6000);

  it('should buy OUT by sending 5 IN to crowdsale contract', async () => {
    var block = await web3.eth.getBlock(await web3.eth.getBlockNumber());
    var timestamp = Number(block.timestamp);
    var startTime = Number(await crowdsale.startTime());



    web3.increaseTime(10);



    await inputToken.send(crowdsale.$address, web3.utils.toWei('5'), '0x', {
      gas: 300000,
      from: accounts[1],
    });

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 5);

    util = require('./util')(web3, outputToken);
    await util.assertTotalSupply(5000);
    await util.assertBalance(accounts[1], 5000);
  }).timeout(6000);

  it('should forward 5 IN to crowdsale wallet', async () => {

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[2], 5);

  }).timeout(6000);

  it('should not buy OUT by sending 5 XYZ to crowdsale contract', async () => {
    //deploy XYZ token
    var xyzToken = await ReferenceToken.new(
      web3,
      'XYZ Token',
      'XYZ',
      1
    );
    assert.ok(xyzToken.$address);

    //mint some XYZ
    await xyzToken.mint(accounts[1], web3.utils.toWei('10'), '0x', {
      gas: 300000,
      from: accounts[0],
    });

    // send XYZ to crowdsale contract
    await xyzToken.send(crowdsale.$address, web3.utils.toWei('5'), '0x', {
      gas: 300000,
      from: accounts[1],
    }).should.be.rejectedWith('invalid opcode');

    util = require('./util')(web3, xyzToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 10);

    util = require('./util')(web3, outputToken);
    await util.assertTotalSupply(5000);
    await util.assertBalance(accounts[1], 5000);
  }).timeout(6000);

  it('should not buy OUT by sending 0 IN to crowdsale contract', async () => {
    await inputToken.send(crowdsale.$address, web3.utils.toWei('0'), '0x', {
      gas: 300000,
      from: accounts[1],
    }).should.be.rejectedWith('invalid opcode');

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 5);
    await util.assertBalance(accounts[2], 5);

    util = require('./util')(web3, outputToken);
    await util.assertTotalSupply(5000);
    await util.assertBalance(accounts[1], 5000);
  }).timeout(6000);

  it('should not buy OUT by sending -5 IN to crowdsale contract', async () => {
    await inputToken.send(crowdsale.$address, web3.utils.toWei('-5'), '0x', {
      gas: 300000,
      from: accounts[1],
    }).should.be.rejectedWith('invalid opcode');

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 5);
    await util.assertBalance(accounts[2], 5);

    util = require('./util')(web3, outputToken);
    await util.assertTotalSupply(5000);
    await util.assertBalance(accounts[1], 5000);
  }).timeout(6000);

  it('should not buy OUT by sending Ether to crowdsale contract', async () => {
    await web3.eth.sendTransaction({from: accounts[1], to: crowdsale.$address, value: web3.utils.toWei('5')}).should.be.rejectedWith('invalid opcode');

    util = require('./util')(web3, inputToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 5);
    await util.assertBalance(accounts[2], 5);

    util = require('./util')(web3, outputToken);
    await util.assertTotalSupply(5000);
    await util.assertBalance(accounts[1], 5000);

    contractEther = await web3.eth.getBalance(crowdsale.$address);
    assert.equal(contractEther, 0);

  }).timeout(6000);


  it('should not buy OUT after crowdsale expired', async () => {

    web3.increaseTime(3600);


    await inputToken.send(crowdsale.$address, web3.utils.toWei('0.01'), '0x', {
      gas: 300000,
      from: accounts[1],
    }).should.be.rejectedWith('invalid opcode');


    util = require('./util')(web3, inputToken);
    await util.getBlock();

    await util.assertTotalSupply(10);
    await util.assertBalance(accounts[1], 5);
    await util.assertBalance(accounts[2], 5);

    util = require('./util')(web3, outputToken);
    await util.assertTotalSupply(5000);
    await util.assertBalance(accounts[1], 5000);
  }).timeout(10000);


});
