import { getGitlabAuthHeader, isGitlabJobToken } from '../gitlab-auth'

describe('Given the authentication to the GitLab API', () => {
  describe('When the token is the job token of the CI job', () => {
    it('Then it is sent in the JOB-TOKEN header', () => {
      const env = { CI_JOB_TOKEN: 'job-token' }

      expect(isGitlabJobToken('job-token', env)).toBe(true)
      expect(getGitlabAuthHeader('job-token', env)).toEqual({ 'JOB-TOKEN': 'job-token' })
    })
  })

  describe('When the token is an access token', () => {
    it('Then it is sent in the PRIVATE-TOKEN header', () => {
      expect(getGitlabAuthHeader('glpat-token', { CI_JOB_TOKEN: 'job-token' })).toEqual({ 'PRIVATE-TOKEN': 'glpat-token' })
      expect(getGitlabAuthHeader('glpat-token', {})).toEqual({ 'PRIVATE-TOKEN': 'glpat-token' })
      expect(isGitlabJobToken('', {})).toBe(false)
    })
  })
})
