import { describe, it, expect } from 'vitest'
import { tf, plural } from '../../src/i18n/format'

describe('tf (template interpolation)', () => {
  it('replaces named placeholders', () => {
    expect(tf('Hello {name}', { name: 'Ada' })).toBe('Hello Ada')
    expect(tf('{a} and {b}', { a: 'x', b: 'y' })).toBe('x and y')
  })

  it('stringifies numbers', () => {
    expect(tf('{count} notes', { count: 3 })).toBe('3 notes')
    expect(tf('{count} notes', { count: 0 })).toBe('0 notes')
  })

  it('leaves unknown placeholders intact', () => {
    expect(tf('Hi {name}', {})).toBe('Hi {name}')
    expect(tf('{a} {b}', { a: 'x' })).toBe('x {b}')
  })

  it('handles repeated placeholders and no placeholders', () => {
    expect(tf('{x}-{x}', { x: '1' })).toBe('1-1')
    expect(tf('plain text', { x: '1' })).toBe('plain text')
  })
})

describe('plural (1/other selection)', () => {
  const forms = { one: '{count} note', other: '{count} notes' }

  it('picks the singular form only for count === 1', () => {
    expect(plural(forms, 1)).toBe('1 note')
    expect(plural(forms, 0)).toBe('0 notes')
    expect(plural(forms, 2)).toBe('2 notes')
  })

  it('injects count automatically and merges extra vars', () => {
    const withVar = { one: '{count} item in {box}', other: '{count} items in {box}' }
    expect(plural(withVar, 1, { box: 'inbox' })).toBe('1 item in inbox')
    expect(plural(withVar, 5, { box: 'inbox' })).toBe('5 items in inbox')
  })
})
