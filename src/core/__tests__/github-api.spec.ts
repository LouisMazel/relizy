import { createGithubRelease } from '../github-api'

const release = {
  tag_name: 'v1.0.0',
  name: 'v1.0.0',
  body: '- Feature',
  prerelease: false,
}

function mockFetch(response: Partial<Response>) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    statusText: 'Created',
    json: () => Promise.resolve({ id: '1', ...release }),
    text: () => Promise.resolve(''),
    ...response,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Given createGithubRelease', () => {
  describe('When the repository is on github.com', () => {
    it('Then it posts the release to api.github.com with the token', async () => {
      const fetchMock = mockFetch({})

      const result = await createGithubRelease({
        repo: { domain: 'github.com', repo: 'user/repo' },
        tokens: { github: 'test-token' },
      }, release)

      expect(result).toEqual({ id: '1', ...release })
      expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/user/repo/releases', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'x-github-api-version': '2022-11-28',
          'authorization': 'Bearer test-token',
        },
        body: JSON.stringify(release),
      })
    })
  })

  describe('When the repository is on GitHub Enterprise Server', () => {
    it('Then it uses the /api/v3 of the domain', async () => {
      const fetchMock = mockFetch({})

      await createGithubRelease({
        repo: { domain: 'github.acme.com', repo: 'user/repo' },
        tokens: { github: 'test-token' },
      }, release)

      expect(fetchMock).toHaveBeenCalledWith('https://github.acme.com/api/v3/repos/user/repo/releases', expect.anything())
    })
  })

  describe('When there is no token', () => {
    it('Then it sends no authorization header', async () => {
      const fetchMock = mockFetch({})

      await createGithubRelease({
        repo: { domain: 'github.com', repo: 'user/repo' },
      }, release)

      expect(fetchMock.mock.calls[0]![1].headers).not.toHaveProperty('authorization')
    })
  })

  describe('When the API answers with an error', () => {
    it('Then it throws with the method, the URL, the status and the response', async () => {
      mockFetch({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: () => Promise.resolve('{"message":"Validation Failed"}'),
      })

      await expect(createGithubRelease({
        repo: { domain: 'github.com', repo: 'user/repo' },
        tokens: { github: 'test-token' },
      }, release))
        .rejects
        .toThrow('[POST] "https://api.github.com/repos/user/repo/releases": 422 Unprocessable Entity {"message":"Validation Failed"}')
    })
  })
})
