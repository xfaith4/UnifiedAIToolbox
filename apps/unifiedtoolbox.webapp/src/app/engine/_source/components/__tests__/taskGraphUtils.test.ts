import { describe, expect, it } from 'vitest'
import { buildGraphTasks, findCycle, graphSignature } from '../taskGraphUtils'
import { TaskStatus, type Task } from '../../types'

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    status: partial.status ?? TaskStatus.PENDING,
    dependencies: partial.dependencies ?? [],
    agent: partial.agent ?? { role: 'Agent', log: [] },
    artifacts: partial.artifacts ?? [],
    cost: partial.cost,
    inputTokens: partial.inputTokens,
    outputTokens: partial.outputTokens,
  }
}

describe('taskGraphUtils', () => {
  it('graphSignature ignores agent logs', () => {
    const a1 = task({ id: 'a', agent: { role: 'Agent', log: ['hello'] } })
    const a2 = task({ id: 'a', agent: { role: 'Agent', log: ['different', 'more'] } })

    const s1 = graphSignature(buildGraphTasks([a1]))
    const s2 = graphSignature(buildGraphTasks([a2]))
    expect(s1).toBe(s2)
  })

  it('findCycle returns null for a DAG', () => {
    const nodes = ['a', 'b', 'c']
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'c'],
    ]
    expect(findCycle(nodes, edges)).toBeNull()
  })

  it('findCycle returns a path when a cycle exists', () => {
    const nodes = ['a', 'b', 'c']
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]
    const cycle = findCycle(nodes, edges)
    expect(cycle).not.toBeNull()
    expect(cycle![0]).toBe(cycle![cycle!.length - 1])
  })
})

