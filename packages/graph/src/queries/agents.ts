/**
 * One document, every chain. The Agent0 (ERC-8004) subgraphs share a schema, so the
 * same query runs unchanged on Base Sepolia and Ethereum Sepolia; only the id differs.
 */
export const AGENTS_QUERY = /* GraphQL */ `
  query BazaarAgents($first: Int!, $skip: Int!) {
    agents(first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
      id
      chainId
      agentId
      owner
      createdAt
      totalFeedback
      registrationFile {
        name
        description
        image
        mcpEndpoint
        a2aEndpoint
        supportedTrusts
        x402Support
        ens
        did
      }
      feedback(where: { isRevoked: false }, first: 50, orderBy: createdAt, orderDirection: desc) {
        tag1
        tag2
        clientAddress
        value
      }
      validations(first: 20) {
        status
      }
    }
  }
`;

export const AGENT_QUERY = /* GraphQL */ `
  query BazaarAgent($id: ID!) {
    agent(id: $id) {
      id
      chainId
      agentId
      owner
      createdAt
      totalFeedback
      registrationFile { name description image mcpEndpoint a2aEndpoint supportedTrusts x402Support ens did }
      feedback(where: { isRevoked: false }, first: 50, orderBy: createdAt, orderDirection: desc) { tag1 tag2 clientAddress value }
      validations(first: 20) { status }
    }
  }
`;
