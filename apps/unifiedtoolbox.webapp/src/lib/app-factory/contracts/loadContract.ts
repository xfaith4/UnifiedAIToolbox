import nodeNextFastifyPnpm from './stacks/node-next-fastify-pnpm.json'
import type { RepoContract, RepoContractStackId } from './RepoContract'

const CONTRACTS: Record<string, RepoContract> = {
  [nodeNextFastifyPnpm.stackId]: nodeNextFastifyPnpm as unknown as RepoContract,
}

export function loadRepoContract(stackId: RepoContractStackId): RepoContract {
  const contract = CONTRACTS[stackId]
  if (!contract) {
    throw new Error(
      `Unknown stackId '${stackId}'. Known: ${Object.keys(CONTRACTS)
        .sort()
        .join(', ')}`
    )
  }
  return contract
}
