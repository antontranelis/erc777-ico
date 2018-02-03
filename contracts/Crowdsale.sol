pragma solidity ^0.4.18;

import "../node_modules/giveth-common-contracts/contracts/SafeMath.sol";
import "../node_modules/eip820/contracts/EIP820Implementer.sol";
import "../node_modules/eip777/contracts/ReferenceToken.sol";
import "../node_modules/eip777/contracts/ITokenRecipient.sol";

/**
 * @title ERC777Crowdsale
 * @dev Crowdsale is a base contract for managing a token crowdsale.
 * Crowdsales have a start and end timestamps, where investors can make
 * token purchases and the crowdsale will assign them tokens based
 * on a token per ETH rate. Funds collected are forwarded to a wallet
 * as they arrive. The contract requires a MintableToken that will be
 * minted as contributions arrive, note that the crowdsale contract
 * must be owner of the token in order to be able to mint it.
 */
contract Crowdsale is EIP820Implementer {
  using SafeMath for uint256;

  // The token being accepted
  ReferenceToken public inputToken;

  // The token being sold
  ReferenceToken public outputToken;

  // start and end timestamps where investments are allowed (both inclusive)
  uint256 public startTime;
  uint256 public endTime;

  // address where funds are collected
  address public wallet;

  // how many token units a buyer gets per wei
  uint256 public rate;

  // amount of raised money in wei
  uint256 public weiRaised;

  /**
   * event for token purchase logging
   * @param purchaser who paid for the tokens
   * @param beneficiary who got the tokens
   * @param value weis paid for purchase
   * @param amount amount of tokens purchased
   */
  event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount);


  function Crowdsale(uint256 _startTime, uint256 _endTime, uint256 _rate, address _wallet, ReferenceToken _inputToken) public {
    require(_startTime >= now);
    require(_endTime >= _startTime);
    require(_rate > 0);
    require(_wallet != address(0));
    require(_inputToken != address(0));


    startTime = _startTime;
    endTime = _endTime;
    rate = _rate;
    wallet = _wallet;
    inputToken = _inputToken;
    outputToken = new ReferenceToken("ERC777 Crowdsale Output Token", "OUT", 1);
    setInterfaceImplementation("ITokenRecipient", this);

  }

  // fallback function can be used to buy tokens
  function () external payable {
    throw;
  }

  function buyTokensForTokens(address beneficiary, uint256 amount) internal {
    require(beneficiary != address(0));
    require(validPurchase());
    require(amount != 0);

    // calculate token amount to be created
    uint256 tokens = getTokenAmount(amount);

    // update state
    weiRaised = weiRaised.add(amount);

    outputToken.mint(beneficiary, tokens, "tokens purchased in ico");
    TokenPurchase(msg.sender, beneficiary, amount, tokens);

    //forward Funds
    inputToken.send(wallet,amount);

  }

  // @return true if crowdsale event has ended
  function hasEnded() public view returns (bool) {
    return now > endTime;
  }

  // Override this method to have a way to add business logic to your crowdsale when buying
  function getTokenAmount(uint256 weiAmount) internal view returns(uint256) {
    return weiAmount.mul(rate);
  }

  // @return true if the transaction can buy tokens
  function validPurchase() internal view returns (bool) {
    bool withinPeriod = now >= startTime && now <= endTime;
    return withinPeriod ;
  }

   function tokensReceived(address from, address to, uint amount, bytes userData, address operator, bytes operatorData ) public {
    require(msg.sender == address(inputToken));
    buyTokensForTokens(from,amount);
   }

}
