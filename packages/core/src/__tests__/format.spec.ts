import { formatDuration, formatRepoTag, formatUtcDate, plural } from '../format'

describe('Given the text helpers of the outputs', () => {
  it('Then plural counts with the singular or the plural word', () => {
    expect(plural(1, 'commit')).toBe('1 commit')
    expect(plural(3, 'commit')).toBe('3 commits')
    expect(plural(2, 'fix', 'fixes')).toBe('2 fixes')
  })

  it('Then formatDuration shows milliseconds under a second, else seconds', () => {
    expect(formatDuration(850)).toBe('850ms')
    expect(formatDuration(2400)).toBe('2.4s')
  })

  it('Then formatUtcDate shows the date to the minute, in UTC', () => {
    expect(formatUtcDate(new Date('2026-11-06T01:42:59Z'))).toBe('2026-11-06 01:42 UTC')
  })

  it('Then formatRepoTag replaces every occurrence of the version', () => {
    expect(formatRepoTag('v{{newVersion}}', '1.2.0')).toBe('v1.2.0')
    expect(formatRepoTag('release-{{newVersion}}/{{newVersion}}', '1.2.0')).toBe('release-1.2.0/1.2.0')
  })
})
