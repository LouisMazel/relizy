import { createGitlabMergeRequest, findGitlabMergeRequest } from '../gitlab'

function mockFetch(response: Partial<Response>) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve(''),
    ...response,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Given the merge requests of GitLab', () => {
  describe('When an open merge request merges the branch', () => {
    it('Then findGitlabMergeRequest gives it, with the token in PRIVATE-TOKEN', async () => {
      const mergeRequest = { iid: 4, web_url: 'https://gitlab.acme.com/acme/lib/-/merge_requests/4', title: 'sync' }
      const fetchMock = mockFetch({
        json: () => Promise.resolve([mergeRequest]),
      })

      expect(await findGitlabMergeRequest({
        token: 'glpat',
        repo: 'acme/lib',
        domain: 'gitlab.acme.com',
        sourceBranch: 'main',
        targetBranch: 'develop',
      })).toEqual(mergeRequest)
      expect(fetchMock).toHaveBeenCalledWith('https://gitlab.acme.com/api/v4/projects/acme%2Flib/merge_requests?state=opened&source_branch=main&target_branch=develop', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'PRIVATE-TOKEN': 'glpat' },
        body: undefined,
      })
    })
  })

  describe('When a merge request is created', () => {
    it('Then createGitlabMergeRequest posts it on gitlab.com by default', async () => {
      const input = { source_branch: 'main', target_branch: 'develop', title: 'chore(release): sync develop with main' }
      const fetchMock = mockFetch({
        json: () => Promise.resolve({ iid: 5, web_url: 'https://gitlab.com/acme/lib/-/merge_requests/5', title: input.title }),
      })

      expect(await createGitlabMergeRequest({ token: 'glpat', repo: 'acme/lib', mergeRequest: input })).toEqual({ iid: 5, web_url: 'https://gitlab.com/acme/lib/-/merge_requests/5', title: input.title })
      expect(fetchMock).toHaveBeenCalledWith('https://gitlab.com/api/v4/projects/acme%2Flib/merge_requests', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
      }))
    })
  })

  describe('When the API refuses', () => {
    it('Then throws its status and text', async () => {
      mockFetch({
        ok: false,
        status: 409,
        text: () => Promise.resolve('Another open merge request already exists'),
      })

      await expect(createGitlabMergeRequest({
        token: 'glpat',
        repo: 'acme/lib',
        mergeRequest: { source_branch: 'main', target_branch: 'develop', title: 't' },
      }))
        .rejects
        .toThrow('GitLab API error (409): Another open merge request already exists')
    })
  })
})
