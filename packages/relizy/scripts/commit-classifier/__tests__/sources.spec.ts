import type { CommitExample } from '../dataset'
import { toLoggedCommit } from '../commitsuite'
import { detectLicense, isPermissive, resolveRepositoryLicense } from '../licenses'
import { balanceExamples, chooseTestRepositories, countLabels, dedupeExamples, detectLanguage } from '../split'

function example(repo: string, hash: string, message = `message ${hash}`, label: CommitExample['label'] = 'fix'): CommitExample {
  return {
    repo,
    source: 'git',
    hash,
    message,
    files: ['src/a.ts'],
    stats: {
      filesChanged: 1,
      insertions: 1,
      deletions: 0,
      binaryFiles: 0,
    },
    label,
    type: 'fix',
    breaking: false,
  }
}

describe('Given detectLicense', () => {
  describe('When the file holds a known license', () => {
    it.each([
      ['MIT License\n\nPermission is hereby granted, free of charge, to any person', 'MIT'],
      ['                                 Apache License\n                           Version 2.0, January 2004', 'Apache-2.0'],
      ['Redistribution and use in source and binary forms, with or without modification... Neither the name of the copyright holder', 'BSD-3-Clause'],
      ['Redistribution and use in source and binary forms, with or without modification, are permitted', 'BSD-2-Clause'],
      ['Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted', 'ISC'],
      ['GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007', 'copyleft'],
      ['GNU AFFERO GENERAL PUBLIC LICENSE', 'copyleft'],
      ['Mozilla Public License Version 2.0', 'copyleft'],
      ['Server Side Public License', 'copyleft'],
      ['All rights reserved.', 'other'],
    ])('Then %j is %s', (text, license) => {
      expect(detectLicense(text)).toBe(license)
    })
  })
})

describe('Given resolveRepositoryLicense', () => {
  describe('When the repository has several license files', () => {
    it('Then a dual permissive license is permissive', () => {
      expect(resolveRepositoryLicense([
        { path: 'LICENSE-MIT', license: 'MIT' },
        { path: 'LICENSE-APACHE', license: 'Apache-2.0' },
      ])).toBe('MIT')
    })

    it('Then one copyleft file makes the repository copyleft', () => {
      expect(resolveRepositoryLicense([
        { path: 'LICENSE', license: 'MIT' },
        { path: 'COPYING', license: 'copyleft' },
      ])).toBe('copyleft')
    })

    it('Then the list of the licenses of the dependencies is not the license of the repository', () => {
      expect(resolveRepositoryLicense([
        { path: 'LICENSE', license: 'Apache-2.0' },
        { path: 'LICENSE-3rdparty.csv', license: 'other' },
      ])).toBe('Apache-2.0')
      expect(resolveRepositoryLicense([
        { path: 'LICENSE-THIRD-PARTY', license: 'copyleft' },
      ])).toBe('none')
    })

    it('Then an SPDX document next to the license texts is metadata, not a license', () => {
      expect(resolveRepositoryLicense([
        { path: 'LICENSE-APACHE-2.0', license: 'Apache-2.0' },
        { path: 'LICENSE-MIT', license: 'MIT' },
        { path: 'LICENSE.spdx', license: 'other' },
      ])).toBe('Apache-2.0')
    })

    it('Then an unknown file next to a permissive one is not trusted', () => {
      expect(resolveRepositoryLicense([
        { path: 'LICENSE', license: 'MIT' },
        { path: 'LICENSE.ee', license: 'other' },
      ])).toBe('other')
    })
  })

  describe('When the repository has no license file', () => {
    it('Then it has none, and none is not permissive', () => {
      expect(resolveRepositoryLicense([])).toBe('none')
      expect(isPermissive('none')).toBe(false)
      expect(isPermissive('Apache-2.0')).toBe(true)
    })
  })
})

describe('Given toLoggedCommit', () => {
  describe('When a CommitSuite commit has a body and files', () => {
    it('Then the subject, the body and the line counts are split as git gives them', () => {
      expect(toLoggedCommit({
        hash: 'abc',
        msg: 'fix(parser): handle tabs (#12)\r\n\r\n* details\r\n',
        author: 'Someone',
        email: 'someone@example.com',
        repo_name: 'acme/parser',
        modified_files: [
          {
            old_path: 'src/a.go',
            new_path: 'src/a.go',
            added_lines: 3,
            deleted_lines: 1,
          },
          {
            old_path: 'src/old.go',
            new_path: null,
            added_lines: 0,
            deleted_lines: 9,
          },
        ],
      })).toEqual({
        hash: 'abc',
        authorName: 'Someone',
        authorEmail: 'someone@example.com',
        subject: 'fix(parser): handle tabs (#12)',
        body: '* details',
        files: [
          { path: 'src/a.go', insertions: 3, deletions: 1 },
          { path: 'src/old.go', insertions: 0, deletions: 9 },
        ],
      })
    })
  })
})

describe('Given dedupeExamples', () => {
  describe('When a commit comes twice, or a change is cherry-picked', () => {
    it('Then only the first copy is kept', () => {
      const { kept, duplicates } = dedupeExamples([
        example('acme/a', '1'),
        {
          ...example('acme/a', '1'),
          source: 'commitsuite',
        },
        example('acme/a', '2', 'same change'),
        example('acme/a', '3', 'same change'),
        example('acme/b', '4', 'same change'),
      ])

      expect(kept.map(item => item.hash)).toEqual(['1', '2', '4'])
      expect(duplicates).toBe(2)
    })
  })
})

describe('Given chooseTestRepositories', () => {
  const counts = new Map(Array.from({ length: 20 }, (_, index) => [`acme/repo-${index}`, 100]))

  describe('When the repositories are many and alike', () => {
    it('Then the test set reaches the share with whole repositories, the same for the same seed', () => {
      const test = chooseTestRepositories(counts, { share: 0.2 })

      expect(test.size).toBe(4)
      expect(chooseTestRepositories(counts, { share: 0.2 })).toEqual(test)
      expect(chooseTestRepositories(counts, { share: 0.2, seed: 'other' })).not.toEqual(test)
    })
  })

  describe('When repositories are forced, excluded or too big', () => {
    it('Then the forced ones are in, the excluded and the oversized ones out', () => {
      const withBig = new Map([
        ...counts,
        ['acme/huge', 5000],
      ])
      const test = chooseTestRepositories(withBig, {
        share: 0.2,
        forced: ['acme/repo-0'],
        excluded: ['acme/repo-1'],
      })

      expect(test.has('acme/repo-0')).toBe(true)
      expect(test.has('acme/repo-1')).toBe(false)
      expect(test.has('acme/huge')).toBe(false)
    })
  })
})

describe('Given countLabels and detectLanguage', () => {
  it('Then every label is counted, and the main language comes from the extensions', () => {
    const counts = countLabels([
      example('a/b', '1'),
      example('a/b', '2', 'x', 'perf'),
    ])

    expect(counts).toMatchObject({ fix: 1, perf: 1, chore: 0 })
    expect(detectLanguage([
      {
        files: ['main.go', 'util.go', 'README.md'],
      },
      {
        files: ['web/app.ts'],
      },
    ])).toBe('Go')
    expect(detectLanguage([
      {
        files: ['README.md'],
      },
    ])).toBe('unknown')
  })
})

describe('Given balanceExamples', () => {
  const big = Array.from({ length: 50 }, (_, index) => example('acme/big', `big-${index}`))
  const small = Array.from({ length: 4 }, (_, index) => example('acme/small', `small-${index}`))
  const rare = Array.from({ length: 3 }, (_, index) => example('acme/big', `perf-${index}`, `perf ${index}`, 'perf'))

  describe('When a label is above the cap', () => {
    it('Then it is cut to the cap, the small repositories whole and the big one taking the rest', () => {
      const balanced = balanceExamples([
        ...big,
        ...small,
        ...rare,
      ], { maxPerLabel: 10, maxRepoShare: 1 })
      const fixes = balanced.filter(item => item.label === 'fix')

      expect(fixes).toHaveLength(10)
      expect(fixes.filter(item => item.repo === 'acme/small')).toHaveLength(4)
      expect(fixes.filter(item => item.repo === 'acme/big')).toHaveLength(6)
    })
  })

  describe('When one repository holds most of a label', () => {
    it('Then it gives at most maxRepoShare of it', () => {
      const others = Array.from({ length: 20 }, (_, index) => example(`acme/repo-${index}`, `other-${index}`))
      const balanced = balanceExamples([
        ...big,
        ...others,
      ], { maxPerLabel: 100, maxRepoShare: 0.1 })

      expect(balanced.filter(item => item.repo === 'acme/big')).toHaveLength(7)
      expect(balanced).toHaveLength(27)
    })
  })

  describe('When a label is under the cap', () => {
    it('Then it is kept whole, and the draw is the same for the same seed', () => {
      const balanced = balanceExamples([
        ...big,
        ...small,
        ...rare,
      ], { maxPerLabel: 10, maxRepoShare: 1 })

      expect(balanced.filter(item => item.label === 'perf')).toHaveLength(3)
      expect(balanceExamples([
        ...big,
        ...small,
        ...rare,
      ], { maxPerLabel: 10, maxRepoShare: 1 })).toEqual(balanced)
      expect(balanceExamples([
        ...big,
        ...small,
        ...rare,
      ], { maxPerLabel: 10, maxRepoShare: 1, seed: 'other' }).map(item => item.hash)).not.toEqual(balanced.map(item => item.hash))
    })
  })
})
