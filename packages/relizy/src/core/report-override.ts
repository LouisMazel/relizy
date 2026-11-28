/** The report flags of the run, `undefined` without one: the config then decides (`status: undefined` stays `undefined`) */
export function getReportOverride(options: { reportJson?: string, reportDotenv?: string, reportMarkdown?: string }, { status }: { status?: boolean } = {}) {
  const report = {
    json: options.reportJson,
    dotenv: options.reportDotenv,
    markdown: options.reportMarkdown,
    ...(status === undefined
      ? {}
      : { status }),
  }
  return Object.values(report).some(value => value !== undefined)
    ? report
    : undefined
}
