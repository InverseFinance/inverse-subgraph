/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { BigDecimal, BigInt, Bytes, Address, log } from '@graphprotocol/graph-ts'
import {
  AccountCToken,
  Account,
  AccountCTokenTransaction,
  Market,
  Comptroller,
} from '../types/schema'
import { CToken } from '../types/templates/CToken/CToken'

import { PriceOracle } from '../types/Comptroller/PriceOracle'

export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = 0; i < decimals; i++) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export let mantissaFactor = 18
export let cTokenDecimals = 8
export let mantissaFactorBD: BigDecimal = exponentToBigDecimal(18)
export let cTokenDecimalsBD: BigDecimal = exponentToBigDecimal(18)
export let zeroBD = BigDecimal.fromString('0')
export let resBigInt = new BigInt(1)

export function createAccountCToken(
  cTokenStatsID: string,
  symbol: string,
  account: string,
  marketID: string,
): AccountCToken {
  let cTokenStats = new AccountCToken(cTokenStatsID)
  cTokenStats.symbol = symbol
  cTokenStats.market = marketID
  cTokenStats.account = account
  cTokenStats.accrualBlockNumber = BigInt.fromI32(0)
  cTokenStats.cTokenBalance = zeroBD
  cTokenStats.totalUnderlyingSupplied = zeroBD
  cTokenStats.totalUnderlyingRedeemed = zeroBD
  cTokenStats.accountBorrowIndex = zeroBD
  cTokenStats.totalUnderlyingBorrowed = zeroBD
  cTokenStats.totalUnderlyingRepaid = zeroBD
  cTokenStats.storedBorrowBalance = zeroBD
  cTokenStats.enteredMarket = false
  return cTokenStats
}

export function createAccount(accountID: string): Account {
  let account = new Account(accountID)
  account.countLiquidated = 0
  account.countLiquidator = 0
  account.hasBorrowed = false
  account.save()
  return account
}

export function updateCommonCTokenStats(
  marketID: string,
  marketSymbol: string,
  accountID: string,
  tx_hash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
  underlyingDecimals: i32,
  exchangeRate: BigDecimal,
): AccountCToken {
  let cTokenStatsID = marketID.concat('-').concat(accountID)
  let cTokenStats = AccountCToken.load(cTokenStatsID)
  if (cTokenStats == null) {
    cTokenStats = createAccountCToken(cTokenStatsID, marketSymbol, accountID, marketID)
  }
  getOrCreateAccountCTokenTransaction(
    marketID,
    cTokenStatsID,
    tx_hash,
    timestamp,
    blockNumber,
    logIndex,
    underlyingDecimals,
    exchangeRate,
  )
  cTokenStats.accrualBlockNumber = blockNumber

  return cTokenStats as AccountCToken
}

export function getOrCreateAccountCTokenTransaction(
  marketID: string,
  accountID: string,
  tx_hash: Bytes,
  timestamp: BigInt,
  block: BigInt,
  logIndex: BigInt,
  underlyingDecimals: i32,
  exchangeRate: BigDecimal,
): AccountCTokenTransaction {
  let id = accountID
    .concat('-')
    .concat(tx_hash.toHexString())
    .concat('-')
    .concat(logIndex.toString())
  let transaction = AccountCTokenTransaction.load(id)

  if (transaction == null) {
    transaction = new AccountCTokenTransaction(id)
    transaction.account = accountID
    transaction.tx_hash = tx_hash
    transaction.timestamp = timestamp
    transaction.block = block
    transaction.logIndex = logIndex

    let contractAddress = Address.fromString(marketID)
    // let contract = CToken.bind(contractAddress)
    let tokenPriceEth = getTokenPrice(
      // block,
      contractAddress,
      underlyingDecimals,
    )
    transaction.underlyingPrice = tokenPriceEth.truncate(underlyingDecimals)
    transaction.exchangeRate = exchangeRate

    transaction.save()
  }

  return transaction as AccountCTokenTransaction
}

export function getMarket(id: string): Market {
  return Market.load(id) as Market
}

export function isMarket(id: string): boolean {
  return getMarket(id) !== null
}

export function getTokenPrice(
  // blockNumber: i32,
  eventAddress: Address,
  underlyingDecimals: i32,
): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let underlyingPrice: BigDecimal
  /* PriceOracle2 is used at the block the Comptroller starts using it.
   * see here https://etherscan.io/address/0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b#events
   * Search for event topic 0xd52b2b9b7e9ee655fcb95d2e5b9e0c9f69e7ef2b8e9d2d0ea78402d576d22e22,
   * and see block 7715908.
   *
   * This must use the cToken address.
   *
   * Note this returns the value without factoring in token decimals and wei, so we must divide
   * the number by (ethDecimals - tokenDecimals) and again by the mantissa.
   * USDC would be 10 ^ ((18 - 6) + 18) = 10 ^ 30
   *
   * Note that they deployed 3 different PriceOracles at the beginning of the Comptroller,
   * and that they handle the decimals different, which can break the subgraph. So we actually
   * defer to Oracle 1 before block 7715908, which works,
   */
  // if (blockNumber > 7715908) {
  let mantissaDecimalFactor = 18 - underlyingDecimals + 18
  let bdFactor = exponentToBigDecimal(mantissaDecimalFactor)
  let oracle = PriceOracle.bind(oracleAddress)
  underlyingPrice = oracle
    .getUnderlyingPrice(eventAddress)
    .toBigDecimal()
    .div(bdFactor)
  // }
  return underlyingPrice
}

export function getTotalReserves(market: Market): BigDecimal  {
  // totalReserves = cash + totalBorrows - (exchangeRate * totalSupply)
  let totalReaserves = market.cash.plus(market.totalBorrows).minus(market.exchangeRate.times(market.totalSupply))
  return totalReaserves
}
