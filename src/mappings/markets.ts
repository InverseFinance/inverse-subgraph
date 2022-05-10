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

  log.debug(`in createMarket : {}`, [marketAddress])
  let isSame = false
  if (marketAddress == cETHAddress) {
    isSame = true
  }
  log.debug(`in createMarket cETHAddress : {}, {}, is same? {}`, [
    cETHAddress,
    marketAddress,
    isSame.toString(),
  ])

  // It is CETH, which has a slightly different interface
  if (marketAddress == cETHAddress) {
    log.debug(`inif market cETHAddress : {}, {}`, [cETHAddress, marketAddress])
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

    // log.debug(`using new code anETH : {}`, [market.underlyingAddress.toString()])

    // It is all other CERC20 contracts
  } else {
    log.debug('in else for {}', [marketAddress])
    if (!tryDenomination.reverted && !trySymbol.reverted) {
      log.debug(`tryDenomination is  : {}, for marketAddress `, [
        tryDenomination.value.toString(),
        marketAddress,
      ])
      log.debug(`trySymbol is  : {}`, [trySymbol.value])
      market = new Market(marketAddress)
      market.name = contract.try_name().value
      log.debug(`market.name is  : {}`, [contract.try_name().value])
      market.symbol = contract.symbol()
      log.debug(`market.symbol is  : {}`, [market.symbol])

      market.underlyingAddress = tryDenomination.value
      let underlyingContract = ERC20.bind(market.underlyingAddress as Address)
      log.debug(`market.underlyingAddress is {}`, [
        market.underlyingAddress.toHexString(),
      ])
      market.underlyingDecimals = underlyingContract.try_decimals().value
      // log.debug(`market.underlyingDecimals is {}`, [market.underlyingDecimals as string])
      market.underlyingName = underlyingContract.try_name().value
      log.debug(`market.underlyingName is {}`, [market.underlyingName.toString()])
      market.underlyingSymbol = underlyingContract.try_symbol().value //trySymbol.value
      log.debug(`market.underlyingSymbol is {}`, [market.underlyingSymbol.toString()])

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
  log.debug(`resBigInt is {}, mantissastuff is {} in createMarket`, [resBigInt.toString(), mantissaFactorBD.toString()])

  market.reserveFactor = reserveFactor.reverted ? BigInt.fromI32(0).toBigDecimal() : reserveFactor.value.toBigDecimal().div(mantissaFactorBD)
  market.rewardPerBlock = rewardPerBlock.reverted ? BigInt.fromI32(0).toBigDecimal() : rewardPerBlock.value.toBigDecimal().div(mantissaFactorBD)

  let comptrollerContract = CToken.bind(Address.fromString(comptrollerAddress))

  let compSpeed = comptrollerContract.try_compSpeeds(Address.fromString(marketAddress))
  market.compSpeed = compSpeed.reverted ? BigInt.fromI32(0).toBigDecimal() : compSpeed.value.toBigDecimal().div(mantissaFactorBD)
  log.debug(`compspeed is {}, marketAddress: {}`, [market.compSpeed.toString(), marketAddress])

  // event.params.newReserveFactorMantissa.toBigDecimal().div(mantissaFactorBD).truncate(mantissaFactor)
  log.debug(`cash is : {}, address: {} `, [market.cash.toString(), market.id])
  log.debug(`underlying name is : {}, and {}`, [market.underlyingName, market.name])

  return market
}
