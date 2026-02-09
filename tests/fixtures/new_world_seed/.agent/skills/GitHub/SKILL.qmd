# Skill: GitHub (GitAuto)

Activation Words: commit, push, branch, pr, merge, github

## Instructions
When the user mentions "committing", "pushing", or "merging", trigger the GitAuto ritual.
1. **Stage**: `git add .`
2. **Summarize**: Analyze the changes and create a concise commit message using the Linscott Standard.
3. **Commit**: `git commit -m "[feat/fix/refactor]: summary"`
4. **Push**: (If configured) `git push origin [current-branch]`

## Tracing logic
Match this skill if query contains Git-specific verbs or "ship it".
