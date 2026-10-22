import { findClosest, getEditDistance, suggestHeader } from '../commitlint/suggest'

const TYPES = ['feat', 'fix', 'docs', 'test', 'perf', 'chore']

describe('Given getEditDistance function', () => {
  it.each([
    ['feat', 'feat', 0],
    ['feta', 'feat', 2],
    ['fxi', 'fix', 2],
    ['nuxtt', 'nuxt', 1],
    ['', 'abc', 3],
  ])('Then measures %s → %s as %i', (a, b, expected) => {
    expect(getEditDistance(a, b)).toBe(expected)
  })
})

describe('Given findClosest function', () => {
  it('Then returns the closest candidate of a small typo', () => {
    expect(findClosest('nuxtt', ['nuxt', 'next', 'core'])).toBe('nuxt')
    expect(findClosest('Dcos', ['docs', 'deps'])).toBe('docs')
  })

  it('Then returns nothing when the word is too far or too short', () => {
    expect(findClosest('release', ['docs', 'deps'])).toBeUndefined()
    expect(findClosest('ab', ['cd'])).toBeUndefined()
  })
})

describe('Given suggestHeader function', () => {
  it.each([
    ['Fix(core): Correct the parser.', 'fix(core): correct the parser'],
    ['feat : add the parser', 'feat: add the parser'],
    ['feat:add the parser', 'feat: add the parser'],
    ['feat (core): add the parser', 'feat(core): add the parser'],
    ['feature: add the parser', 'feat: add the parser'],
    ['bugfix: correct the parser', 'fix: correct the parser'],
    ['feta: add the parser', 'feat: add the parser'],
    ['fix(nuxtt): correct the module', 'fix(nuxt): correct the module'],
    ['fix(my scope): correct the module', 'fix(my-scope): correct the module'],
    ['fix(): correct the module', 'fix: correct the module'],
    ['feat(core)!: Drop the option.', 'feat(core)!: drop the option'],
    ['  feat: add the parser  ', 'feat: add the parser'],
    ['feat: API of the parser', undefined],
    ['feat: wait...', undefined],
  ])('Then fixes "%s" as "%s"', (header, expected) => {
    expect(suggestHeader(header, { types: TYPES, allowedScopes: ['nuxt', 'core', 'my-scope'], lowercaseSubject: true })).toBe(expected)
  })

  it('Then keeps the case of the subject without lowercaseSubject, e.g. a component name', () => {
    expect(suggestHeader('feat: MazChart - expose the chart.', { types: TYPES })).toBe('feat: MazChart - expose the chart')
  })

  it('Then keeps an unknown scope without allowed scopes', () => {
    expect(suggestHeader('fix(Anything): correct it.', { types: TYPES })).toBe('fix(Anything): correct it')
  })

  it('Then keeps a type it cannot recognize', () => {
    expect(suggestHeader('banana: add it.', { types: TYPES })).toBe('banana: add it')
  })

  it('Then rewrites the default revert message when a revert type exists', () => {
    expect(suggestHeader('Revert "feat: add the parser"', { types: [...TYPES, 'revert'] })).toBe('revert: feat: add the parser')
    expect(suggestHeader('Revert "feat: add the parser"', { types: TYPES })).toBeUndefined()
  })

  it('Then gives up on a message that is not a commit header', () => {
    expect(suggestHeader('wip', { types: TYPES })).toBeUndefined()
    expect(suggestHeader('Apply 1 suggestion(s) to 1 file(s)', { types: TYPES })).toBeUndefined()
  })
})
