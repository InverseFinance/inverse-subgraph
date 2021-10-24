/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigInt, dataSource } from '@graphprotocol/graph-ts'
import { Market } from '../types/schema'
import { ERC20 } from '../types/templates/CToken/ERC20'
import { CToken } from '../types/templates/CToken/CToken'

import { zeroBD } from './helpers'

let cETHAddress: string = '0x697b4acAa24430F254224eB794d2a85ba1Fa1FB8'

export function createMarket(marketAddress: string): Market {
  let market: Market
  let contract = CToken.bind(Address.fromString(marketAddress))

  let tryDenomination = contract.try_underlying();
  let trySymbol = contract.try_symbol();

  // It is CETH, which has a slightly different interface
  if (marketAddress == cETHAddress) {
    market = new Market(marketAddress)
    market.underlyingAddress = Address.fromString(
      '0x0000000000000000000000000000000000000000',
    )
    market.underlyingDecimals = 18

    market.underlyingName = 'Ether`'
    market.underlyingSymbol = 'ETH'

    // It is all other CERC20 contracts
  } else {
    if (!tryDenomination.reverted && !trySymbol.reverted) {
      market = new Market(marketAddress)
      market.underlyingAddress = tryDenomination.value
      let underlyingContract = ERC20.bind(market.underlyingAddress as Address)
      market.underlyingDecimals = underlyingContract.try_decimals().value
      market.underlyingName = underlyingContract.try_name().value
      market.underlyingSymbol = trySymbol.value
    }
  }

  market.totalInterestAccumulatedExact = BigInt.fromI32(0)
  market.totalInterestAccumulated = zeroBD

  let interestRateModelAddress = contract.try_interestRateModel()
  let reserveFactor = contract.try_reserveFactorMantissa()

  market.cash = zeroBD
  market.collateralFactor = zeroBD
  market.exchangeRate = zeroBD
  market.interestRateModelAddress = interestRateModelAddress.reverted
    ? Address.fromString('0x0000000000000000000000000000000000000000')
    : interestRateModelAddress.value
  market.name = contract.name()
  market.symbol = contract.symbol()
  market.totalBorrows = zeroBD
  market.totalSupply = zeroBD

  market.accrualBlockNumber = 0
  market.blockTimestamp = 0
  market.borrowIndex = zeroBD
  market.reserveFactor = reserveFactor.reverted ? BigInt.fromI32(0) : reserveFactor.value

  return market
}
