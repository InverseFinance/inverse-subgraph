/* eslint-disable prefer-const */ // to satisfy AS compiler
import {
  Mint,
  Redeem,
  Borrow,
  RepayBorrow,
  LiquidateBorrow,
  Transfer,
  AccrueInterest,
  NewReserveFactor,
  NewMarketInterestRateModel,
  CToken,
  ReservesAdded,
  ReservesReduced,
  NewRewardPerBlock,
} from '../types/templates/CToken/CToken'

import {
  Market,
  Account,
  AccountCToken,
  MintEvent,
  RedeemEvent,
  LiquidationEvent,
  TransferEvent,
  BorrowEvent,
  RepayEvent,
} from '../types/schema'

import { createMarket } from './markets'
import {
  createAccount,
  updateCommonCTokenStats,
  exponentToBigDecimal,
  cTokenDecimalsBD,
  cTokenDecimals,
  mantissaFactor,
  mantissaFactorBD,
  zeroBD,
  isMarket,
  getTokenPrice,
  resBigInt,
  getTotalReserves
} from './helpers'
import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'

// Blocks per year, 4.4 (blocks/minute) * 60 * 24 * 365
export const blocksPerYear = '2336000'
let invAddress: string = '0x65b35d6eb7006e0e607bc54eb2dfd459923476fe'
let invAddress2: string = '0x1637e4e9941d55703a7a5e7807d6ada3f7dcd61b'

/* Account supplies assets into market and receives cTokens in exchange
 *
 * event.mintAmount is the underlying asset
 * event.mintTokens is the amount of cTokens minted
 * event.minter is the account
 *
 * Notes
 *    Transfer event will always get emitted with this
 *    Mints originate from the cToken address, not 0x000000, which is typical of ERC-20s
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    No need to updateCommonCTokenStats, handleTransfer() will
 *    No need to update cTokenBalance, handleTransfer() will
 */
export function handleMint(event: Mint): void {
  let market = Market.load(event.address.toHexString())
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  let marketID = event.address.toHexString()
  if (!isMarket(marketID)) {
    return
  }
  let mintID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let cTokenAmount = event.params.mintTokens
    .toBigDecimal()
    .div(exponentToBigDecimal(market.decimals))
    .truncate(cTokenDecimals)

  let underlyingAmount = event.params.mintAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  if (cTokenAmount.gt(zeroBD)) {
    market.exchangeRate = underlyingAmount.div(cTokenAmount).truncate(mantissaFactor)
    market.totalSupply = market.totalSupply.plus(cTokenAmount)
    market.cash = market.cash.plus(underlyingAmount)

    market.totalReserves = getTotalReserves(market as Market)
    market.save()
  }

  let mint = new MintEvent(mintID)
  mint.amount = cTokenAmount
  mint.minter = event.params.minter
  mint.cToken = event.address
  mint.blockNumber = event.block.number.toI32()
  mint.blockTime = event.block.timestamp.toI32()
  mint.cTokenSymbol = market.symbol
  mint.underlyingAmount = underlyingAmount
  mint.save()
}

/*  Account supplies cTokens into market and receives underlying asset in exchange
 *
 *  event.redeemAmount is the underlying asset
 *  event.redeemTokens is the cTokens
 *  event.redeemer is the account
 *
 *  Notes
 *    Transfer event will always get emitted with this
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    No need to updateCommonCTokenStats, handleTransfer() will
 *    No need to update cTokenBalance, handleTransfer() will
 */
export function handleRedeem(event: Redeem): void {
  let marketID = event.address.toHexString()
  let market = Market.load(marketID)
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  if (!isMarket(marketID)) {
    return
  }
  let redeemID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let cTokenAmount = event.params.redeemTokens
    .toBigDecimal()
    .div(exponentToBigDecimal(market.decimals))
    .truncate(cTokenDecimals)

  if (marketID == invAddress || marketID == invAddress2) {
    let tokenPriceInEth = getTokenPrice(event.address, market.underlyingDecimals)
    market.underlyingPrice = tokenPriceInEth.truncate(market.underlyingDecimals)
    market.accrualBlockNumber = event.block.number.toI32()
    market.blockTimestamp = event.block.timestamp.toI32()
  }

  let underlyingAmount = event.params.redeemAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)
  if (cTokenAmount.gt(zeroBD)) {
    market.exchangeRate = underlyingAmount.div(cTokenAmount).truncate(mantissaFactor)
    market.totalSupply = market.totalSupply.minus(cTokenAmount)

    // Don't calculate like this, balance goes negative
    // market.cash = market.cash.minus(underlyingAmount)

    let contract = CToken.bind(Address.fromString(marketID))
    let tryCash = contract.try_getCash()
    market.cash = tryCash.reverted ? BigInt.fromI32(0).toBigDecimal() : tryCash.value.toBigDecimal().div(exponentToBigDecimal(market.underlyingDecimals))

    market.totalReserves = getTotalReserves(market as Market)
    market.save()
  }

  let redeem = new RedeemEvent(redeemID)
  redeem.amount = cTokenAmount
  redeem.cToken = event.address
  redeem.redeemer = event.params.redeemer
  redeem.blockNumber = event.block.number.toI32()
  redeem.blockTime = event.block.timestamp.toI32()
  redeem.cTokenSymbol = market.symbol
  redeem.underlyingAmount = underlyingAmount
  redeem.save()
}

/* Borrow assets from the protocol. All values either ETH or ERC20
 *
 * event.params.totalBorrows = of the whole market (not used right now)
 * event.params.accountBorrows = total of the account
 * event.params.borrowAmount = that was added in this event
 * event.params.borrower = the account
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 */
export function handleBorrow(event: Borrow): void {
  let market = Market.load(event.address.toHexString())
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  let marketID = event.address.toHexString()
  if (!isMarket(marketID)) {
    return
  }
  let accountID = event.params.borrower.toHex()
  let account = Account.load(accountID)
  if (account == null) {
    account = createAccount(accountID)
  }
  account.hasBorrowed = true
  account.save()

  let borrowAmountBD = event.params.borrowAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))

  market.totalBorrows = event.params.totalBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)
  // market.cash = market.cash.minus(borrowAmountBD)

  // Don't calculate like this, balance goes negative
  // market.cash = market.cash.minus(underlyingAmount)

  let contract = CToken.bind(Address.fromString(marketID))
  let tryCash = contract.try_getCash()
  market.cash = tryCash.reverted ? BigInt.fromI32(0).toBigDecimal() : tryCash.value.toBigDecimal().div(exponentToBigDecimal(market.underlyingDecimals))
  // market.cash = BigInt.fromI32(0).toBigDecimal() // : tryCash.value.toBigDecimal().div(market.underlyingDecimals)

  market.totalReserves = getTotalReserves(market as Market)

  market.save()

  // Update cTokenStats common for all events, and return the stats to update unique
  // values for each event
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

  cTokenStats.storedBorrowBalance = event.params.accountBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  cTokenStats.accountBorrowIndex = market.borrowIndex
  cTokenStats.totalUnderlyingBorrowed = cTokenStats.totalUnderlyingBorrowed.plus(
    borrowAmountBD,
  )
  cTokenStats.save()

  let borrowID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let borrowAmount = event.params.borrowAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  let accountBorrows = event.params.accountBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  let contractAddress = Address.fromString(market.id)
  let tokenPriceEth = getTokenPrice(contractAddress, market.underlyingDecimals)

  let borrow = new BorrowEvent(borrowID)
  borrow.amount = borrowAmount
  borrow.accountBorrows = accountBorrows
  borrow.borrower = event.params.borrower
  borrow.blockNumber = event.block.number.toI32()
  borrow.blockTime = event.block.timestamp.toI32()
  borrow.underlyingSymbol = market.underlyingSymbol
  borrow.cToken = event.address

  borrow.underlyingPrice = tokenPriceEth.truncate(market.underlyingDecimals)
  borrow.exchangeRate = market.exchangeRate
  borrow.save()
}

/* Repay some amount borrowed. Anyone can repay anyones balance
 *
 * event.params.totalBorrows = of the whole market (not used right now)
 * event.params.accountBorrows = total of the account (not used right now)
 * event.params.repayAmount = that was added in this event
 * event.params.borrower = the borrower
 * event.params.payer = the payer
 *
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    Once a account totally repays a borrow, it still has its account interest index set to the
 *    markets value. We keep this, even though you might think it would reset to 0 upon full
 *    repay.
 */
export function handleRepayBorrow(event: RepayBorrow): void {
  let market = Market.load(event.address.toHexString())
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  let marketID = event.address.toHexString()
  if (!isMarket(marketID)) {
    return
  }
  let accountID = event.params.borrower.toHex()
  let account = Account.load(accountID)
  if (account == null) {
    createAccount(accountID)
  }

  let repayAmountBD = event.params.repayAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))

  market.totalBorrows = event.params.totalBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  // market.cash = market.cash.plus(repayAmountBD)

  let contract = CToken.bind(Address.fromString(marketID))
  let tryCash = contract.try_getCash()
  market.cash = tryCash.reverted ? BigInt.fromI32(0).toBigDecimal() : tryCash.value.toBigDecimal().div(exponentToBigDecimal(market.underlyingDecimals))

  market.totalReserves = getTotalReserves(market as Market)

  market.save()

  // Update cTokenStats common for all events, and return the stats to update unique
  // values for each event
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

  cTokenStats.storedBorrowBalance = event.params.accountBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  cTokenStats.accountBorrowIndex = market.borrowIndex
  cTokenStats.totalUnderlyingRepaid = cTokenStats.totalUnderlyingRepaid.plus(
    repayAmountBD,
  )
  cTokenStats.save()

  let repayID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let repayAmount = event.params.repayAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  let accountBorrows = event.params.accountBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  let contractAddress = Address.fromString(market.id)
  let tokenPriceEth = getTokenPrice(contractAddress, market.underlyingDecimals)

  let repay = new RepayEvent(repayID)
  repay.amount = repayAmount
  repay.accountBorrows = accountBorrows
  repay.borrower = event.params.borrower
  repay.blockNumber = event.block.number.toI32()
  repay.blockTime = event.block.timestamp.toI32()
  repay.underlyingSymbol = market.underlyingSymbol
  repay.payer = event.params.payer
  repay.cToken = event.address
  repay.underlyingPrice = tokenPriceEth
  repay.exchangeRate = market.exchangeRate
  repay.save()
}

/*
 * Liquidate an account who has fell below the collateral factor.
 *
 * event.params.borrower - the borrower who is getting liquidated of their cTokens
 * event.params.cTokenCollateral - the market ADDRESS of the ctoken being liquidated
 * event.params.liquidator - the liquidator
 * event.params.repayAmount - the amount of underlying to be repaid
 * event.params.seizeTokens - cTokens seized (transfer event should handle this)
 *
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this.
 *    When calling this function, event RepayBorrow, and event Transfer will be called every
 *    time. This means we can ignore repayAmount. Seize tokens only changes state
 *    of the cTokens, which is covered by transfer. Therefore we only
 *    add liquidation counts in this handler.
 */
export function handleLiquidateBorrow(event: LiquidateBorrow): void {
  let market = Market.load(event.address.toHexString())
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  let marketID = event.address.toHexString()
  if (!isMarket(marketID)) {
    return
  }

  let liquidatorID = event.params.liquidator.toHex()
  let liquidator = Account.load(liquidatorID)
  if (liquidator == null) {
    liquidator = createAccount(liquidatorID)
  }
  liquidator.countLiquidator = liquidator.countLiquidator + 1
  liquidator.save()

  let borrowerID = event.params.borrower.toHex()
  let borrower = Account.load(borrowerID)
  if (borrower == null) {
    borrower = createAccount(borrowerID)
  }
  borrower.countLiquidated = borrower.countLiquidated + 1
  borrower.save()

  // For a liquidation, the liquidator pays down the borrow of the underlying
  // asset. They seize one of potentially many types of cToken collateral of
  // the underwater borrower. So we must get that address from the event, and
  // the repay token is the event.address
  let marketRepayToken = Market.load(event.address.toHexString())
  if (marketRepayToken == null) {
    marketRepayToken = createMarket(event.address.toHexString())
  }

  let marketCTokenLiquidated = Market.load(event.params.cTokenCollateral.toHexString())
  if (marketCTokenLiquidated == null) {
    marketCTokenLiquidated = createMarket(event.address.toHexString())
  }

  let borrowCTokenStatsID = marketRepayToken.id.concat('-').concat(borrowerID)
  let borrowCToken = AccountCToken.load(borrowCTokenStatsID)

  let seizeCTokenStatsID = marketCTokenLiquidated.id.concat('-').concat(borrowerID)
  let seizeCToken = AccountCToken.load(seizeCTokenStatsID)

  let liquidateID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let cTokenAmount = event.params.seizeTokens
    .toBigDecimal()
    .div(exponentToBigDecimal(marketCTokenLiquidated.decimals)) // e.g. use xINV 18 and 18 decimals underlying decimals market.decimals)) // cTokenDecimalsBD)
    .truncate(cTokenDecimals)
  let underlyingCTokenAmount = event.params.seizeTokens
    .toBigDecimal()
    .div(exponentToBigDecimal(marketCTokenLiquidated.decimals)) // cTokenDecimalsBD)
    .truncate(cTokenDecimals)
  let underlyingRepayAmount = event.params.repayAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(marketRepayToken.underlyingDecimals))
    .truncate(marketRepayToken.underlyingDecimals)

  let liquidation = new LiquidationEvent(liquidateID)
  liquidation.blockNumber = event.block.number.toI32()
  liquidation.blockTime = event.block.timestamp.toI32()
  liquidation.liquidator = event.params.liquidator
  liquidation.borrower = event.params.borrower
  liquidation.seizeAmount = cTokenAmount
  liquidation.cToken = event.address
  liquidation.seizeCToken = event.params.cTokenCollateral
  liquidation.underlyingRepayAmount = underlyingRepayAmount
  liquidation.underlyingSeizeAmount = marketCTokenLiquidated.exchangeRate.times(underlyingCTokenAmount
    // cTokenAmount,
  )
  liquidation.borrowerRemainingUnderlyingCollateral = marketCTokenLiquidated.exchangeRate.times(
    seizeCToken.cTokenBalance,
  )
  liquidation.borrowerRemainingBorrowBalance = borrowCToken.storedBorrowBalance
  liquidation.save()
}

/* Transferring of cTokens
 *
 * event.params.from = sender of cTokens
 * event.params.to = receiver of cTokens
 * event.params.amount = amount sent
 *
 * Notes
 *    Possible ways to emit Transfer:
 *      seize() - i.e. a Liquidation Transfer (does not emit anything else)
 *      redeemFresh() - i.e. redeeming your cTokens for underlying asset
 *      mintFresh() - i.e. you are lending underlying assets to create ctokens
 *      transfer() - i.e. a basic transfer
 *    This function handles all 4 cases. Transfer is emitted alongside the mint, redeem, and seize
 *    events. So for those events, we do not update cToken balances.
 */
export function handleTransfer(event: Transfer): void {
  // We don't updateMarket with normal transfers,
  // since mint, redeem, and seize transfers will already run updateMarket()
  let marketID = event.address.toHexString()
  let market = Market.load(marketID)
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  if (!isMarket(marketID)) {
    return
  }
  let amountUnderlying = market.exchangeRate.times(
    event.params.amount.toBigDecimal().div(exponentToBigDecimal(market.decimals)), //cTokenDecimalsBD),
  )
  let amountUnderylingTruncated = amountUnderlying.truncate(market.underlyingDecimals)

  // Checking if the tx is FROM the cToken contract (i.e. this will not run when minting)
  // If so, it is a mint, and we don't need to run these calculations
  let accountFromID = event.params.from.toHex()
  if (accountFromID != marketID) {
    let accountFrom = Account.load(accountFromID)
    if (accountFrom == null) {
      createAccount(accountFromID)
    }

    // Update cTokenStats common for all events, and return the stats to update unique
    // values for each event
    let cTokenStatsFrom = updateCommonCTokenStats(
      market.id,
      market.symbol,
      accountFromID,
      event.transaction.hash,
      event.block.timestamp,
      event.block.number,
      event.logIndex,
      market.underlyingDecimals,
      market.exchangeRate,
    )

    cTokenStatsFrom.cTokenBalance = cTokenStatsFrom.cTokenBalance.minus(
      event.params.amount
        .toBigDecimal()
        .div(exponentToBigDecimal(market.decimals))
        .truncate(cTokenDecimals),
    )

    cTokenStatsFrom.totalUnderlyingRedeemed = cTokenStatsFrom.totalUnderlyingRedeemed.plus(
      amountUnderylingTruncated,
    )
    cTokenStatsFrom.save()
  }

  // Checking if the tx is TO the cToken contract (i.e. this will not run when redeeming)
  // If so, we ignore it. this leaves an edge case, where someone who accidentally sends
  // cTokens to a cToken contract, where it will not get recorded. Right now it would
  // be messy to include, so we are leaving it out for now TODO fix this in future
  let accountToID = event.params.to.toHex()
  if (accountToID != marketID) {
    let accountTo = Account.load(accountToID)
    if (accountTo == null) {
      createAccount(accountToID)
    }

    // Update cTokenStats common for all events, and return the stats to update unique
    // values for each event
    let cTokenStatsTo = updateCommonCTokenStats(
      market.id,
      market.symbol,
      accountToID,
      event.transaction.hash,
      event.block.timestamp,
      event.block.number,
      event.logIndex,
      market.underlyingDecimals,
      market.exchangeRate,
    )

    cTokenStatsTo.cTokenBalance = cTokenStatsTo.cTokenBalance.plus(
      event.params.amount
        .toBigDecimal()
        .div(exponentToBigDecimal(market.decimals))
        .truncate(cTokenDecimals),
    )

    // cTokenStatsTo.cTokenBalance = event.params.amount
    //   .toBigDecimal()
    //   .div(cTokenDecimalsBD)
    //   .truncate(cTokenDecimals)

    let amt = event.params.amount.toBigDecimal()

    cTokenStatsTo.totalUnderlyingSupplied = cTokenStatsTo.totalUnderlyingSupplied.plus(
      amountUnderylingTruncated,
    )
    cTokenStatsTo.save()
  }

  let transferID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let transfer = new TransferEvent(transferID)
  transfer.amount = event.params.amount.toBigDecimal().div(exponentToBigDecimal(market.decimals))
  transfer.to = event.params.to
  transfer.from = event.params.from
  transfer.blockNumber = event.block.number.toI32()
  transfer.blockTime = event.block.timestamp.toI32()
  transfer.cTokenSymbol = market.symbol
  transfer.save()
}

// Used for all cERC20 contracts
// Returns the price of USDC in eth. i.e. 0.005 would mean ETH is $200
// function getUSDCpriceETH(blockNumber: i32): BigDecimal {
//   let comptroller = Comptroller.load('1')
//   let oracleAddress = comptroller.priceOracle as Address
//   let priceOracle1Address = Address.fromString('02557a5e05defeffd4cae6d83ea3d173b272c904')
//   let USDCAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 '
//   let usdPrice: BigDecimal

//   // See notes on block number if statement in getTokenPrices()
//   if (blockNumber > 7715908) {
//     let oracle2 = PriceOracle2.bind(oracleAddress)
//     let mantissaDecimalFactorUSDC = 18 - 6 + 18
//     let bdFactorUSDC = exponentToBigDecimal(mantissaDecimalFactorUSDC)
//     usdPrice = oracle2
//       .getUnderlyingPrice(Address.fromString(cUSDCAddress))
//       .toBigDecimal()
//       .div(bdFactorUSDC)
//   } else {
//     let oracle1 = PriceOracle.bind(priceOracle1Address)
//     usdPrice = oracle1
//       .getPrice(Address.fromString(USDCAddress))
//       .toBigDecimal()
//       .div(mantissaFactorBD)
//   }
//   return usdPrice
// }

export function handleAccrueInterest(event: AccrueInterest): void {
  let marketID = event.address.toHexString()
  let blockNumber = event.block.number.toI32()
  let blockTimestamp = event.block.timestamp.toI32()
  if (!isMarket(marketID)) {
    return
  }
  let market = Market.load(marketID)
  if (market == null) {
    market = createMarket(marketID)
  }

  let contractAddress = Address.fromString(market.id)
  let contract = CToken.bind(contractAddress)

  let tokenPriceEth = getTokenPrice(
    // blockNumber,
    contractAddress,
    market.underlyingDecimals,
  )
if (market.accrualBlockNumber != blockNumber) {
    // let usdPriceInEth = getUSDCPriceETH(blockNumber)
    market.underlyingPrice = tokenPriceEth.truncate(market.underlyingDecimals)
  }

  market.underlyingPrice = tokenPriceEth.truncate(market.underlyingDecimals)

  market.accrualBlockNumber = blockNumber
  market.blockTimestamp = blockTimestamp

  market.cash = event.params.cashPrior
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  market.totalInterestAccumulatedExact = market.totalInterestAccumulatedExact.plus(
    event.params.interestAccumulated,
  )
  market.totalInterestAccumulated = market.totalInterestAccumulatedExact
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  market.borrowIndex = event.params.borrowIndex
    .toBigDecimal()
    .div(mantissaFactorBD)
    .truncate(mantissaFactor)

  market.totalBorrows = event.params.totalBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  market.supplyRate = contract
    .borrowRatePerBlock()
    .toBigDecimal()
    .times(BigDecimal.fromString(blocksPerYear))
    .div(mantissaFactorBD)
    .truncate(mantissaFactor)

  market.totalReserves = getTotalReserves(market as Market)

  // This fails on only the first call to cZRX. It is unclear why, but otherwise it works.
  // So we handle it like this.
  let supplyRatePerBlock = contract.try_supplyRatePerBlock()
  if (supplyRatePerBlock.reverted) {
    log.info('***CALL FAILED*** : supplyRatePerBlock() reverted', [])
    market.borrowRate = zeroBD
  } else {
    market.borrowRate = supplyRatePerBlock.value
      .toBigDecimal()
      .times(BigDecimal.fromString(blocksPerYear))
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)
    market.supplyRatePerBlock = supplyRatePerBlock.value.toBigDecimal().div(mantissaFactorBD)
  }

  market.borrowRatePerBlock = contract.borrowRatePerBlock().toBigDecimal().div(mantissaFactorBD)

  if (market == null) {
    return
  } else {
    market.save()
  }
}

export function handleNewReserveFactor(event: NewReserveFactor): void {
  let market = Market.load(event.address.toHexString())
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  let marketID = event.address.toHexString()
  if (!isMarket(marketID)) {
    return
  }
  // market.reserveFactor = event.params.newReserveFactorMantissa.div(resBigInt)
  market.reserveFactor = event.params.newReserveFactorMantissa.toBigDecimal().div(mantissaFactorBD).truncate(mantissaFactor)
  market.save()
}

export function handleNewMarketInterestRateModel(
  event: NewMarketInterestRateModel,
): void {
  let market = Market.load(event.address.toHexString())
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  let marketID = event.address.toHexString()
  if (!isMarket(marketID)) {
    return
  }
  market.interestRateModelAddress = event.params.newInterestRateModel
  market.save()
}

export function handleNewRewardPerBlock(event: NewRewardPerBlock): void {
  let market = Market.load(event.address.toHexString())
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  let marketID = event.address.toHexString()
  if (!isMarket(marketID)) {
    return
  }
  market.rewardPerBlock = event.params.newRewardPerBlock
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)
  market.save()
}

export function handleReservesAdded(event: ReservesAdded): void {
  let market = Market.load(event.address.toHexString())
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  let marketID = event.address.toHexString()
  if (!isMarket(marketID)) {
    return
  }
  market.totalReserves = event.params.newTotalReserves
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)
  market.save()
}

export function handleReservesUpdated(event: ReservesReduced): void {
  let market = Market.load(event.address.toHexString())
  if (market == null) {
    market = createMarket(event.address.toHexString())
  }
  let marketID = event.address.toHexString()
  if (!isMarket(marketID)) {
    return
  }
  market.totalReserves = event.params.newTotalReserves
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  market.save()
}
