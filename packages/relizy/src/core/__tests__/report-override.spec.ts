import { getReportOverride } from '../report-override'

describe('Given the report flags of the CLI', () => {
  it('When none is given, Then there is no override: the config decides', () => {
    expect(getReportOverride({})).toBeUndefined()
    expect(getReportOverride({}, { status: undefined })).toBeUndefined()
  })

  it('When --report-status or --no-report-status is given, Then it overrides release.report.status', () => {
    expect(getReportOverride({}, { status: true })).toEqual({
      json: undefined,
      dotenv: undefined,
      markdown: undefined,
      status: true,
    })
    expect(getReportOverride({}, { status: false })).toEqual({
      json: undefined,
      dotenv: undefined,
      markdown: undefined,
      status: false,
    })
  })

  it('When a file flag is given, Then the status is left to the config', () => {
    expect(getReportOverride({ reportJson: 'relizy.json' })).toEqual({ json: 'relizy.json', dotenv: undefined, markdown: undefined })
  })
})
