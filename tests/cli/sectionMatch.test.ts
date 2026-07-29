// Loose section-name matching of the CLI (cli/noteflow.js). It is the LAST
// resort of matchSectionOrNull (after exact and substring) and only read-only
// commands ('read', 'path') opt into it, so the rules have to be tight: a
// candidate wins only when it is unique and its words cover the query's.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

const sectionTokens = cli.sectionTokens as (name: string) => Set<string>
const fuzzySectionMatches = cli.fuzzySectionMatches as (
  sections: { name: string }[],
  query: string,
) => { name: string }[]

const sections = (...names: string[]) => names.map(name => ({ name }))
const names = (matches: { name: string }[]) => matches.map(s => s.name)

describe('sectionTokens', () => {
  it('strips diacritics, case and punctuation', () => {
    expect([...sectionTokens('Configuración/Deploy')]).toEqual(['configuracion', 'deploy'])
  })

  it('drops filler words in both languages', () => {
    expect([...sectionTokens('Variables de entorno')]).toEqual(['variables', 'entorno'])
    expect([...sectionTokens('The state of the art')]).toEqual(['state', 'art'])
  })

  it('keeps digits and non-latin scripts as tokens', () => {
    expect([...sectionTokens('Sprint 14 — Планы')]).toEqual(['sprint', '14', 'планы'])
  })

  it('returns an empty set for punctuation-only or filler-only names', () => {
    expect([...sectionTokens('— / —')]).toEqual([])
    expect([...sectionTokens('de la')]).toEqual([])
  })
})

describe('fuzzySectionMatches', () => {
  it('matches when the query words are a subset of the section words', () => {
    const found = fuzzySectionMatches(sections('Note', 'Variables Entorno'), 'Variables de entorno')
    expect(names(found)).toEqual(['Variables Entorno'])
  })

  it('ignores accents and case in both directions', () => {
    expect(names(fuzzySectionMatches(sections('Configuracion'), 'configuración'))).toEqual(['Configuracion'])
    expect(names(fuzzySectionMatches(sections('Consideración final'), 'consideracion'))).toEqual(['Consideración final'])
  })

  it('reports every candidate so the caller can refuse to guess', () => {
    const found = fuzzySectionMatches(sections('Tasks backend', 'Tasks frontend'), 'tasks')
    expect(names(found)).toEqual(['Tasks backend', 'Tasks frontend'])
  })

  it('does not match when the query adds words the section lacks', () => {
    expect(fuzzySectionMatches(sections('Variables Entorno'), 'Variables de entorno local')).toEqual([])
  })

  it('never matches on an empty/filler-only query', () => {
    expect(fuzzySectionMatches(sections('Note', 'Tasks'), '')).toEqual([])
    expect(fuzzySectionMatches(sections('Note', 'Tasks'), 'de la')).toEqual([])
  })

  it('tolerates a missing section list', () => {
    expect(fuzzySectionMatches(undefined as never, 'tasks')).toEqual([])
  })
})
