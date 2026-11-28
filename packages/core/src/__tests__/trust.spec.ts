import type { NpmCommandRunner } from '../staged'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InteractiveAuthRequiredError, TrustedPublisherError } from '../stage-publish'
import { createTrustedPublisher, getTrustArgs, listTrustedPublishers, parseJsonStream, readReleaseWorkflows, revokeTrustedPublisher } from '../trust'

const LOCAL: NodeJS.ProcessEnv = {}

describe('Given the trusted publishers of npm', () => {
  describe('When the arguments of npm trust are built', () => {
    it('Then gives GitHub the bare workflow file, the repository and the environment', () => {
      expect(getTrustArgs({
        packageName: '@scope/core',
        source: {
          type: 'github',
          file: '.github/workflows/release.yml',
          repository: 'acme/repo',
          environment: 'npm-staged',
        },
        allowPublish: false,
        allowStagePublish: true,
      })).toEqual([
        'trust',
        'github',
        '@scope/core',
        '--file',
        'release.yml',
        '--repo',
        'acme/repo',
        '--env',
        'npm-staged',
        '--allow-stage-publish',
        '--yes',
        '--json',
      ])
    })

    it('Then gives GitLab the project, and both permissions with a dry run', () => {
      expect(getTrustArgs({
        packageName: 'pkg',
        source: { type: 'gitlab', file: '.gitlab-ci.yml', project: 'group/project' },
        allowPublish: true,
        allowStagePublish: true,
        dryRun: true,
      })).toEqual([
        'trust',
        'gitlab',
        'pkg',
        '--file',
        '.gitlab-ci.yml',
        '--project',
        'group/project',
        '--allow-publish',
        '--allow-stage-publish',
        '--yes',
        '--json',
        '--dry-run',
      ])
    })

    it('Then gives CircleCI its identifiers and every context', () => {
      expect(getTrustArgs({
        packageName: 'pkg',
        source: {
          type: 'circleci',
          orgId: 'o',
          projectId: 'p',
          pipelineDefinitionId: 'd',
          vcsOrigin: 'github.com/acme/repo',
          contextIds: ['c1', 'c2'],
        },
        allowPublish: true,
        allowStagePublish: false,
      })).toEqual([
        'trust',
        'circleci',
        'pkg',
        '--org-id',
        'o',
        '--project-id',
        'p',
        '--pipeline-definition-id',
        'd',
        '--vcs-origin',
        'github.com/acme/repo',
        '--context-id',
        'c1',
        '--context-id',
        'c2',
        '--allow-publish',
        '--yes',
        '--json',
      ])
    })

    it('Then needs a permission', () => {
      expect(() => getTrustArgs({
        packageName: 'pkg',
        source: { type: 'gitlab', file: '.gitlab-ci.yml', project: 'g/p' },
        allowPublish: false,
        allowStagePublish: false,
      }))
        .toThrow(TrustedPublisherError)
    })
  })

  describe('When npm prints its JSON', () => {
    it('Then reads the objects printed one after the other', () => {
      expect(parseJsonStream('{"id":"a","file":"x {y}"}\n{"id":"b","note":"quote \\" }"}\n')).toEqual([
        { id: 'a', file: 'x {y}' },
        { id: 'b', note: 'quote " }' },
      ])
      expect(parseJsonStream('npm notice\n[{"id":"a"},{"id":"b"}]')).toEqual([
        { id: 'a' },
        { id: 'b' },
      ])
      expect(parseJsonStream('{broken}\n{"id":"c"}')).toEqual([
        { id: 'c' },
      ])
      expect(parseJsonStream('')).toEqual([])
    })
  })

  describe('When they are listed, created and revoked', () => {
    it('Then runs npm with the login of the person and maps the configurations', async () => {
      const runner = vi.fn<NpmCommandRunner>().mockResolvedValue({
        stdout: '{"id":"t1","type":"github","file":"release.yml","repository":"acme/repo","permissions":["createPackage"]}\n{"id":"t2","type":"GitLab","project":"g/p","environment":"prod","allowStagePublish":true,"allowPublish":false}',
      })

      const publishers = await listTrustedPublishers({
        cwd: '/repo',
        packageName: 'pkg',
        otp: '123456',
        env: LOCAL,
        runner,
      })

      expect(runner).toHaveBeenCalledWith([
        'trust',
        'list',
        'pkg',
        '--json',
        '--otp=123456',
      ], {
        cwd: tmpdir(),
        env: { NPM_TOKEN: '', NODE_AUTH_TOKEN: '', RELIZY_NPM_TOKEN: '' },
        timeoutMs: 60_000,
      })
      expect(publishers).toEqual([
        expect.objectContaining({
          id: 't1',
          type: 'github',
          file: 'release.yml',
          repository: 'acme/repo',
          allowPublish: true,
          allowStagePublish: false,
        }),
        expect.objectContaining({
          id: 't2',
          type: 'gitlab',
          repository: 'g/p',
          environment: 'prod',
          allowPublish: false,
          allowStagePublish: true,
        }),
      ])
    })

    it('Then reads the permissions as npm prints them (observed on npmjs, a direct publish allows staging too)', async () => {
      const runner = vi.fn<NpmCommandRunner>().mockResolvedValue({
        stdout: '\n{\n  "id": "7b6d8fc9-ec24-4a19-86c4-12adfd5a1430",\n  "type": "github",\n  "file": "release.yml",\n  "repository": "acme/repo",\n  "environment": "npm-staged",\n  "permissions": [\n    "createStagedPackage"\n  ]\n}\n\n{\n  "id": "6bbc6525-548f-493a-8132-cb0cfce161f9",\n  "type": "github",\n  "file": "release.yml",\n  "repository": "acme/repo",\n  "environment": "npm-direct",\n  "permissions": [\n    "createPackage",\n    "createStagedPackage"\n  ]\n}\n',
      })

      expect(await listTrustedPublishers({
        cwd: '/repo',
        packageName: 'pkg',
        env: LOCAL,
        runner,
      })).toEqual([
        expect.objectContaining({
          id: '7b6d8fc9-ec24-4a19-86c4-12adfd5a1430',
          environment: 'npm-staged',
          allowPublish: false,
          allowStagePublish: true,
        }),
        expect.objectContaining({
          id: '6bbc6525-548f-493a-8132-cb0cfce161f9',
          environment: 'npm-direct',
          allowPublish: true,
          allowStagePublish: true,
        }),
      ])
    })

    it('Then creates and revokes', async () => {
      const runner = vi.fn<NpmCommandRunner>().mockResolvedValueOnce({ stdout: '{"id":"t3","type":"github"}\n{"package":"pkg"}' }).mockResolvedValueOnce({ stdout: '' })

      const created = await createTrustedPublisher({
        cwd: '/repo',
        packageName: 'pkg',
        source: { type: 'github', file: 'release.yml', repository: 'a/r' },
        allowPublish: true,
        allowStagePublish: false,
        env: LOCAL,
        runner,
      })
      await revokeTrustedPublisher({
        cwd: '/repo',
        packageName: 'pkg',
        id: 't3',
        otp: '1',
        env: LOCAL,
        runner,
      })

      expect(created[0]).toMatchObject({ id: 't3' })
      expect(runner.mock.calls[1]![0]).toEqual([
        'trust',
        'revoke',
        'pkg',
        '--id',
        't3',
        '--json',
        '--otp=1',
      ])
    })

    it('Then refuses in a CI, gives the OTP errors as is, and turns the others into a TrustedPublisherError', async () => {
      const runner = vi.fn<NpmCommandRunner>()
      await expect(listTrustedPublishers({
        cwd: '/repo',
        packageName: 'pkg',
        env: { CI: 'true' },
        runner,
      })).rejects.toBeInstanceOf(InteractiveAuthRequiredError)
      expect(runner).not.toHaveBeenCalled()

      const otp = Object.assign(new Error('npm error code EOTP'), { stdout: '{"error":{"code":"EOTP","authUrl":"https://www.npmjs.com/auth/cli/x"}}' })
      runner.mockRejectedValueOnce(otp)
      await expect(listTrustedPublishers({
        cwd: '/repo',
        packageName: 'pkg',
        env: LOCAL,
        runner,
      })).rejects.toBe(otp)

      runner.mockRejectedValueOnce(new Error('npm error code E403\nnpm error 403 Forbidden - tokens that bypass two-factor authentication cannot manage trusted publishers'))
      await expect(listTrustedPublishers({
        cwd: '/repo',
        packageName: 'pkg',
        env: LOCAL,
        runner,
      })).rejects.toMatchObject({
        code: 'E_TRUST',
        status: 403,
        message: expect.stringContaining('npm login'),
      })

      runner.mockRejectedValueOnce(new Error('npm error code E409\nnpm error 409 Conflict - already exists'))
      await expect(createTrustedPublisher({
        cwd: '/repo',
        packageName: 'pkg',
        source: { type: 'github', file: 'release.yml', repository: 'a/r' },
        allowPublish: true,
        allowStagePublish: false,
        env: LOCAL,
        runner,
      }))
        .rejects
        .toMatchObject({ status: 409, message: 'npm trust failed for pkg: npm error code E409' })
    })
  })

  describe('When the release workflows of a project are read', () => {
    let cwd: string

    beforeEach(() => {
      cwd = mkdtempSync(join(tmpdir(), 'relizy-trust-'))
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'root', repository: 'https://github.com/acme/repo' }))
      mkdirSync(join(cwd, '.github/workflows'), { recursive: true })
    })

    afterEach(() => {
      rmSync(cwd, { recursive: true, force: true })
    })

    it('Then reads the generated workflow and the ones running relizy, with the environments of their releasing jobs', async () => {
      writeFileSync(join(cwd, '.github/workflows/release.yml'), '# Generated by relizy init: https://relizy.dev/guide/github-actions\nname: Release\njobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm relizy release --yes\n')
      writeFileSync(join(cwd, '.github/workflows/publish.yaml'), 'jobs:\n  test:\n    runs-on: ubuntu-latest\n  stable:\n    environment: npm-staged\n    steps:\n      - run: npx relizy release\n  canary:\n    environment:\n      name: npm-direct\n    steps:\n      - uses: LouisMazel/relizy@v2\n')
      writeFileSync(join(cwd, '.github/workflows/preview.yml'), '# Generated by relizy init: https://relizy.dev/guide/merge-preview\njobs:\n  preview:\n    steps:\n      - run: relizy merge-preview\n')
      writeFileSync(join(cwd, '.github/workflows/ci.yml'), 'jobs:\n  test:\n    steps:\n      - run: pnpm test\n')
      writeFileSync(join(cwd, '.github/workflows/dry-run.yml'), 'jobs:\n  preview:\n    steps:\n      - run: pnpm relizy release --dry-run\n')

      expect(await readReleaseWorkflows({ cwd })).toEqual([
        {
          provider: 'github',
          file: 'publish.yaml',
          path: '.github/workflows/publish.yaml',
          repository: 'acme/repo',
          generated: false,
          jobs: [
            { name: 'stable', environment: 'npm-staged' },
            { name: 'canary', environment: 'npm-direct' },
          ],
        },
        {
          provider: 'github',
          file: 'release.yml',
          path: '.github/workflows/release.yml',
          repository: 'acme/repo',
          generated: true,
          jobs: [
            { name: 'release' },
          ],
        },
      ])
    })

    it('Then reads a given file, and the GitLab CI file only at the root', async () => {
      writeFileSync(join(cwd, '.github/workflows/ci.yml'), 'jobs:\n  build:\n    environment: prod\n')
      writeFileSync(join(cwd, '.gitlab-ci.yml'), 'include:\n  - component: gitlab.com/relizy/gitlab-component/release@2\nrelease:\n  environment: npm\n  script: [relizy release]\n')
      mkdirSync(join(cwd, '.gitlab'))
      writeFileSync(join(cwd, '.gitlab/release.yml'), 'release:\n  script: [relizy release]\n')

      const workflows = await readReleaseWorkflows({
        cwd,
        files: ['.github/workflows/ci.yml'],
      })

      expect(workflows.map(workflow => [workflow.provider, workflow.path, workflow.jobs])).toEqual([
        [
          'github',
          '.github/workflows/ci.yml',
          [
            { name: 'build', environment: 'prod' },
          ],
        ],
        [
          'gitlab',
          '.gitlab-ci.yml',
          [
            { name: 'release', environment: 'npm' },
          ],
        ],
      ])
    })

    it('Then gives no job for a file that cannot be parsed', async () => {
      writeFileSync(join(cwd, '.github/workflows/release.yml'), '# relizy release\nrun: relizy release\n  bad: [\n')

      expect((await readReleaseWorkflows({ cwd }))[0]).toMatchObject({ jobs: [] })
    })
  })
})
