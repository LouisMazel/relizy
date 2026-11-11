// The outputs and the summary of the CI job running the tests must not receive anything from them
for (const variable of ['GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY']) {
  delete process.env[variable]
}
