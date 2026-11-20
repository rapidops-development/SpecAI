// SpecAI: UI-020
/** Where shorthand issues link when specai.yaml sets no issueUrl. */
export const defaultIssueUrl = 'https://github.com/{owner}/{repo}/issues/{number}'

const shorthand = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([0-9]+)$/

/** The link for an issue: a URL as written, or owner/repo#number filled into the template. */
export function issueHref(issue: string, template = defaultIssueUrl): string | undefined {
  const m = shorthand.exec(issue)
  if (!m) return /^https?:\/\//.test(issue) ? issue : undefined
  const [, owner, repo, number] = m
  return template.replaceAll('{owner}', owner).replaceAll('{repo}', repo).replaceAll('{number}', number)
}
