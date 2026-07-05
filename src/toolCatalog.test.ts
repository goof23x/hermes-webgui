import { describe, expect, it } from 'vitest'
import { toolCatalog, toolsets } from './toolCatalog'

describe('tool catalog', () => {
  it('includes core Hermes toolsets and tools', () => {
    expect(toolCatalog.length).toBeGreaterThan(50)
    expect(toolsets).toContain('browser')
    expect(toolsets).toContain('terminal')
    expect(toolCatalog.some(tool => tool.name === 'terminal')).toBe(true)
    expect(toolCatalog.some(tool => tool.name === 'session_search')).toBe(true)
  })
})
