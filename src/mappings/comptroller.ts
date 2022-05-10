/* eslint-disable prefer-const */ // to satisfy AS compiler

import {
  MarketEntered,
  MarketExited,
  NewCloseFactor,
  NewCollateralFactor,
  NewLiquidationIncentive,
  NewPriceOracle,
  MarketListed,
  CompSpeedUpdated,
} from '../types/Comptroller/Comptroller'

import { CToken } from '../types/templates'
import { Market, Comptroller, Account } from '../types/schema'
import { mantissaFactorBD, updateCommonCTokenStats, createAccount } from './helpers'
import { createMarket } from './markets'
import { log } from '@graphprotocol/graph-ts'

let invalid_markets: string[] = ['0xbdf447b39d152d6a234b4c02772b8ab5d1783f72']

export function handleMarketListed(event: MarketListed): void {
  if (invalid_markets.indexOf(event.params.cToken.toHexString()) !== -1) {
    return
  }

  // Dynamically index all new listed tokens
  CToken.create(event.params.cToken)
  log.debug(`event.params.cToken is : {}, {}`, [
    event.params.cToken.toHexString(),
    event.transaction.hash.toHexString(),
  ])
  // Create the market for this token, since it's now been listed.
  let market = createMarket(event.params.cToken.toHexString())
  log.debug(`creating market from market listed here: {}`, [market.id.toString()])
  if (market == null) {
    return
  } else {
    market.save()
  }
}

export function handleMarketEntered(event: MarketEntered): void {
  let market = Market.load(event.params.cToken.toHexString())
  // Null check needed to avoid crashing on a new market added. Ideally when dynamic data
  // sources can source from the contract creation block and not the time the
  // comptroller adds the market, we can avoid this altogether
  if (market != null) {
    let accountID = event.params.account.toHex()
    let account = Account.load(accountID)
    if (account == null) {
      createAccount(accountID)
    }

    let cTokenStats = updateCommonCTokenStats(
      market.id,
      market.symbol,
      accountID,
      event.transaction.hash,
      event.block.timestamp,
      event.block.number,
      event.logIndex,
      market.underlyingDecimals,
      market.exchangeRate,
    )
    cTokenStats.enteredMarket = true
    cTokenStats.save()
    // } else {
    //   log.debug(`creating market manually here: {}`, [event.params.cToken.toHexString()])
    //   // Dynamically index all new listed tokens
    //   CToken.create(event.params.cToken)
    //   // Create the market for this token, since it's now been listed.
    //   let market = createMarket(event.params.cToken.toHexString())
    //   log.debug(`market is : {}`, [event.params.cToken.toHexString()])
    //   if (market == null) {
    //     return
    //   } else {
    //     market.save()
    //   }
  }
}

export function handleMarketExited(event: MarketExited): void {
  let market = Market.load(event.params.cToken.toHexString())
  // Null check needed to avoid crashing on a new market added. Ideally when dynamic data
  // sources can source from the contract creation block and not the time the
  // comptroller adds the market, we can avoid this altogether
  if (market != null) {
    let accountID = event.params.account.toHex()
    let account = Account.load(accountID)
    if (account == null) {
      createAccount(accountID)
    }

    let cTokenStats = updateCommonCTokenStats(
      market.id,
      market.symbol,
      accountID,
      event.transaction.hash,
      event.block.timestamp,
      event.block.number,
      event.logIndex,
      market.underlyingDecimals,
      market.exchangeRate,
    )
    cTokenStats.enteredMarket = false
    cTokenStats.save()
  }
}

export function handleNewCloseFactor(event: NewCloseFactor): void {
  let comptroller = Comptroller.load('1')
  // This is the first event used in this mapping, so we use it to create the entity
  if (comptroller == null) {
    comptroller = new Comptroller('1')
  }
  comptroller.closeFactor = event.params.newCloseFactorMantissa
  comptroller.save()
}

export function handleNewCollateralFactor(event: NewCollateralFactor): void {
  let market = Market.load(event.params.cToken.toHexString())
  // Null check needed to avoid crashing on a new market added. Ideally when dynamic data
  // sources can source from the contract creation block and not the time the
  // comptroller adds the market, we can avoid this altogether
  if (market != null) {
    market.collateralFactor = event.params.newCollateralFactorMantissa
      .toBigDecimal()
      .div(mantissaFactorBD)
    market.save()
  }
}

// This should be the first event acccording to etherscan but it isn't.... price oracle is. weird
export function handleNewLiquidationIncentive(event: NewLiquidationIncentive): void {
  let comptroller = Comptroller.load('1')
  // This is the first event used in this mapping, so we use it to create the entity
  if (comptroller == null) {
    comptroller = new Comptroller('1')
  }
  comptroller.liquidationIncentive = event.params.newLiquidationIncentiveMantissa
  comptroller.save()
}

export function handleNewPriceOracle(event: NewPriceOracle): void {
  let comptroller = Comptroller.load('1')
  // This is the first event used in this mapping, so we use it to create the entity
  if (comptroller == null) {
    comptroller = new Comptroller('1')
  }
  comptroller.priceOracle = event.params.newPriceOracle
  comptroller.save()
}

export function handleCompSpeedUpdated(event: CompSpeedUpdated): void {
  let market = Market.load(event.params.cToken.toHexString())
  log.debug(`compspeed tx is {}`, [event.transaction.hash.toHexString()])
  if (market != null) {
    log.debug(`updating compspeed for {}, prev compspeed is {}`, [market.id, market.compSpeed.toString()])
    market.compSpeed = event.params.newSpeed
      .toBigDecimal()
      .div(mantissaFactorBD)
    market.save()
    log.debug(`updating compspeed for {}, compspeed is {}`, [market.id, market.compSpeed.toString()])
  } else {
    log.debug(`market isnull for some reason is {}`, [event.params.cToken.toHexString()])
  }
}