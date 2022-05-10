/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigInt, Bytes, dataSource } from '@graphprotocol/graph-ts'
import { Comptroller, Market } from '../types/schema'
import { ERC20 } from '../types/templates/CToken/ERC20'
import { CToken } from '../types/templates/CToken/CToken'

import { zeroBD, resBigInt, mantissaFactorBD } from './helpers'
import { log } from '@graphprotocol/graph-ts'

// let cETHAddress: string = '0x697b4acAa24430F254224eB794d2a85ba1Fa1FB8'
let cETHAddress: string = '0x697b4acaa24430f254224eb794d2a85ba1fa1fb8'
let comptrollerAddress: string = '0x4dCf7407AE5C07f8681e1659f626E114A7667339'

export function createMarket(marketAddress: string): Market {
  let market: Market
  let contract = CToken.bind(Address.fromString(marketAddress))

  let tryDenomination = contract.try_underlying()
  let trySymbol = contract.try_symbol()

  let isSame = false
  if (marketAddress == cETHAddress) {
    isSame = true
  }

  // It is CETH, which has a slightly different interface
  if (marketAddress == cETHAddress) {
    log.debug(`Market cETHAddress : {}, {}`, [cETHAddress, marketAddress])
    market = new Market(cETHAddress) // marketAddress)
    market.underlyingAddress = Address.fromString(
      '0x0000000000000000000000000000000000000000',
    )
    market.underlyingDecimals = 18

    market.underlyingName = 'Ether`'
    market.underlyingSymbol = 'ETH'
    market.name = 'anETH' //contract.name()
    market.symbol = 'anETH' //contract.symbol()
    market.decimals = 8

    // It is all other CERC20 contracts
  } else {

    if (!tryDenomination.reverted && !trySymbol.reverted) {
      market = new Market(marketAddress)
      market.name = contract.try_name().value
      market.symbol = contract.symbol()

      market.underlyingAddress = tryDenomination.value
      let underlyingContract = ERC20.bind(market.underlyingAddress as Address)

      market.underlyingDecimals = underlyingContract.try_decimals().value
      market.underlyingName = underlyingContract.try_name().value
      market.underlyingSymbol = underlyingContract.try_symbol().value //trySymbol.value

      let mainContract = ERC20.bind(Address.fromString(market.id))

      market.decimals = mainContract.try_decimals().value as i32
    }
  }

  market.totalInterestAccumulatedExact = BigInt.fromI32(0)
  market.totalInterestAccumulated = zeroBD

  let interestRateModelAddress = contract.try_interestRateModel()
  let reserveFactor = contract.try_reserveFactorMantissa()
  let rewardPerBlock = contract.try_rewardPerBlock()

  market.cash = zeroBD
  market.collateralFactor = zeroBD
  market.exchangeRate = zeroBD
  market.interestRateModelAddress = interestRateModelAddress.reverted
    ? Address.fromString('0x0000000000000000000000000000000000000000')
    : interestRateModelAddress.value

  market.totalBorrows = zeroBD
  market.totalSupply = zeroBD
  market.totalReserves = zeroBD
  market.underlyingPrice = zeroBD

  market.supplyRate = zeroBD
  market.borrowRate = zeroBD

  market.borrowRatePerBlock = zeroBD
  market.supplyRatePerBlock = zeroBD

  market.accrualBlockNumber = 0
  market.blockTimestamp = 0
  market.borrowIndex = zeroBD

  market.reserveFactor = reserveFactor.reverted ? BigInt.fromI32(0).toBigDecimal() : reserveFactor.value.toBigDecimal().div(mantissaFactorBD)
  market.rewardPerBlock = rewardPerBlock.reverted ? BigInt.fromI32(0).toBigDecimal() : rewardPerBlock.value.toBigDecimal().div(mantissaFactorBD)

  let comptrollerContract = CToken.bind(Address.fromString(comptrollerAddress))

  let compSpeed = comptrollerContract.try_compSpeeds(Address.fromString(marketAddress))
  market.compSpeed = compSpeed.reverted ? BigInt.fromI32(0).toBigDecimal() : compSpeed.value.toBigDecimal().div(mantissaFactorBD)

  return market
}
