import type { LoggedCommit } from './dataset'

/** A commit of CommitSuite (`all_data/<owner>_<name>/commits.json`), the fields the dataset reads */
export interface CommitSuiteFile {
  old_path: string | null
  new_path: string | null
  added_lines: number
  deleted_lines: number
}

export interface CommitSuiteCommit {
  hash: string
  msg: string
  author: string
  email: string
  repo_name: string
  modified_files: CommitSuiteFile[]
}

/** A CommitSuite commit as `extractExample()` reads it: subject, body, files and line counts */
export function toLoggedCommit(commit: CommitSuiteCommit): LoggedCommit {
  const [subject = '', ...body] = commit.msg.replace(/\r\n/g, '\n').split('\n')
  return {
    hash: commit.hash,
    authorName: commit.author,
    authorEmail: commit.email,
    subject,
    body: body.join('\n').trim(),
    files: commit.modified_files.map(file => ({
      path: file.new_path ?? file.old_path ?? '',
      insertions: file.added_lines,
      deletions: file.deleted_lines,
    })),
  }
}
