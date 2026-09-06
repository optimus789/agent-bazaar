/** Messari DEX-AMM standardized schema. Works on any Messari DEX subgraph (Uniswap v3, Aerodrome, …). */
export const TOP_POOLS_QUERY = /* GraphQL */ `
  query BazaarTopPools($n: Int!) {
    liquidityPools(first: $n, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id
      name
      inputTokens { id symbol decimals }
      totalValueLockedUSD
      cumulativeVolumeUSD
      fees { feePercentage feeType }
    }
  }
`;

export const POOL_SNAPSHOTS_QUERY = /* GraphQL */ `
  query BazaarPoolSnapshots($pool: String!, $days: Int!) {
    liquidityPool(id: $pool) {
      id
      name
      inputTokens { id symbol decimals }
      totalValueLockedUSD
      fees { feePercentage feeType }
    }
    liquidityPoolDailySnapshots(where: { pool: $pool }, first: $days, orderBy: timestamp, orderDirection: desc) {
      timestamp
      totalValueLockedUSD
      dailyVolumeUSD
    }
  }
`;
