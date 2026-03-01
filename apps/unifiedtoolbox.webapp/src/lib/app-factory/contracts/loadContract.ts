import nodeNextFastifyPnpm from './stacks/node-next-fastify-pnpm.json'
import nodeNextAppNpm from './stacks/node-next-app-npm.json'
import browserViteReactNpm from './stacks/browser-vite-react-npm.json'
import type { RepoContract, RepoContractStackId } from './RepoContract'

const CONTRACTS: Record<string, RepoContract> = {
  [nodeNextFastifyPnpm.stackId]: nodeNextFastifyPnpm as unknown as RepoContract,
  [nodeNextAppNpm.stackId]: nodeNextAppNpm as unknown as RepoContract,
  [browserViteReactNpm.stackId]: browserViteReactNpm as unknown as RepoContract,
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
