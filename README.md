# Inverse-subgraph v0.1.0

[Inverse](https://inverse.finance/) is an open-source protocol for algorithmic, efficient Money Markets on the Ethereum blockchain and a a fork of Compound. 

This Subgraph indexes the data of the protocol.

## Networks and Performance

This subgraph can be found on The Graph Hosted Service at https://thegraph.com/explorer/subgraph/graphprotocol/inverse.

You can also run this subgraph locally, if you wish. Instructions for that can be found in [The Graph Documentation](https://thegraph.com/docs/quick-start).

### ABI

The ABI used is `ctoken.json`. It is a stripped down version of the full abi provided by inverse, that satisfies the calls we need to make for both cETH and cERC20 contracts. This way we can use 1 ABI file, and one mapping for cETH and cERC20.

## Getting started with querying

Below are a few ways to show how to query the inverse Subgraph for data. The queries show most of the information that is queryable, but there are many other filtering options that can be used, just check out the [querying api](https://api.studio.thegraph.com/query/11640/inverse-subgraph/v0.1.0).

You can also see the saved queries on the hosted service for examples or using Hasura API Explorer : https://graphiql-online.com/graphiql using the API link : https://api.studio.thegraph.com/query/11640/inverse-subgraph/v0.1.0

{
# mintEvents(first:2
# # where:{cToken:"0x1637e4e9941d55703a7a5e7807d6ada3f7dcd61b",
# where:{cToken:"0x65b35d6eb7006e0e607bc54eb2dfd459923476fe",
# # blockNumber_gte:13628002 # 14377924
# }
#   orderBy:blockNumber, orderDirection:desc
# # block:{number:14377924}
# ){
#   id underlyingAmount cToken blockNumber
# }
redeemEvents(first:2
# where:{cToken:"0x1637e4e9941d55703a7a5e7807d6ada3f7dcd61b",
where:{cToken:"0x65b35d6eb7006e0e607bc54eb2dfd459923476fe",
blockNumber_gte:13628000 # 14377924
}
orderBy:blockNumber, orderDirection:asc
# block:{number:14377924}
){
  id underlyingAmount cToken blockNumber
}

markets(first:100, # 19085.211940774450386653
block:{number:13629911}#13628003} # 14377923} # 13628300}
# where:{id:"0x1637e4e9941d55703a7a5e7807d6ada3f7dcd61b"}
where:{id:"0x65b35d6eb7006e0e607bc54eb2dfd459923476fe"}
# where:{id_in:["0x65b35d6eb7006e0e607bc54eb2dfd459923476fe", "0x697b4acaa24430f254224eb794d2a85ba1fa1fb8"]}
# id:"0x697b4acaa24430f254224eb794d2a85ba1fa1fb8",
# block:{number:12836233}
) {
  id cash name underlyingPrice decimals underlyingDecimals
  totalReserves underlyingAddress reserveFactor
}

liquidationEvents{#(where:{id:"0x0737050c0068a34a2e52ac07608db25c8fc434e391593a2e28b84c3111b9a9d7-17", cToken:"0x697b4acaa24430f254224eb794d2a85ba1fa1fb8"}){ blockTime blockNumber 
id liquidator cToken seizeCToken seizeAmount underlyingSeizeAmount borrowerRemainingUnderlyingCollateral
}

# redeemEvents(first:500,
# where:{
# id:"0xa8db843c2b772e3c02f0d7cfa975a1f40b6ebb05a29cde2f8329610d031b2ec3-23"}
# block:{number:12710034}
# ) {
# id amount underlyingAmount cToken cTokenSymbol
# } #(where:{cToken:"0x1637e4e9941d55703a7a5e7807d6ada3f7dcd61b"})
# accountCTokenTransaction(
# # where:{account:"0x697b4acaa24430f254224eb794d2a85ba1fa1fb8-0x4e880933aaa461a5fbd0d499f1e142d78f77c8ea"}
# id:"0x697b4acaa24430f254224eb794d2a85ba1fa1fb8-0x4e880933aaa461a5fbd0d499f1e142d78f77c8ea-0xa8db843c2b772e3c02f0d7cfa975a1f40b6ebb05a29cde2f8329610d031b2ec3-19"
# block:{number:12710034}
# ) {
#   id exchangeRate 
# }

accountCToken(id:"0x697b4acaa24430f254224eb794d2a85ba1fa1fb8-0x4e880933aaa461a5fbd0d499f1e142d78f77c8ea",
block:{
  number:12710034
}
) {
  id symbol cTokenBalance storedBorrowBalance
}

}


4/1	Add comp speed in markets 	with compSpeed = comptroller.compSpeeds(cTokenAddress)
4/1	Add rewardperBlock/underlyingdecimals in markets	 -> Added
4/5	issue with cashbalance of 1st xINV contract (negative)	 -> debugged this
3/31	Fix missing information for INV markets (Oracle/blockTimestamp etc)	
