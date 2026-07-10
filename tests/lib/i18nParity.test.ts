import { describe, it, expect } from 'vitest'
import { en } from '../../src/i18n/en'
import { es } from '../../src/i18n/es'

// Guards the EN/ES message trees against the failure modes TypeScript can't see:
// keys that slip through via `as any`, empty strings, and — the most likely
// translation bug — a `{placeholder}` present in one language but not the other.

type Tree = { [key: string]: string | Tree }

const PLACEHOLDER = /\{(\w+)\}/g

function placeholders(value: string): Set<string> {
  return new Set(Array.from(value.matchAll(PLACEHOLDER), (m) => m[1]))
}

// Walks a tree and yields [dotted.path, value] for every leaf string. Objects
// shaped like plural forms ({ one, other }) are traversed as normal nested trees.
function* leaves(tree: Tree, prefix = ''): Generator<[string, string]> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      yield [path, value]
    } else {
      yield* leaves(value, path)
    }
  }
}

function leafMap(tree: Tree): Map<string, string> {
  return new Map(leaves(tree))
}

describe('i18n EN/ES parity', () => {
  const enLeaves = leafMap(en as unknown as Tree)
  const esLeaves = leafMap(es as unknown as Tree)

  it('has the exact same set of keys in both languages', () => {
    const enKeys = [...enLeaves.keys()].sort()
    const esKeys = [...esLeaves.keys()].sort()
    expect(esKeys).toEqual(enKeys)
  })

  it('has no empty string values', () => {
    for (const [path, value] of enLeaves) {
      expect(value.length, `en.${path} is empty`).toBeGreaterThan(0)
    }
    for (const [path, value] of esLeaves) {
      expect(value.length, `es.${path} is empty`).toBeGreaterThan(0)
    }
  })

  it('has matching {placeholder} sets for every string', () => {
    for (const [path, enValue] of enLeaves) {
      const esValue = esLeaves.get(path)
      expect(esValue, `es is missing ${path}`).toBeDefined()
      const enVars = [...placeholders(enValue)].sort()
      const esVars = [...placeholders(esValue as string)].sort()
      expect(esVars, `placeholder mismatch at ${path}`).toEqual(enVars)
    }
  })
})
