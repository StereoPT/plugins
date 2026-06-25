---
name: version-to-issues
description: Convert a project version note's tasks into GitHub Issues
argument-hint: "[project-name], [version]"
disable-model-invocation: true
---

Convert a project version note into GitHub Issues. Arguments: $ARGUMENTS

$ARGUMENTS contains two values separated by a comma: the project name and the version string.
Example: `InstaPuppeteer, Alpha v5.0.0`

Follow these steps exactly:

## 1. Parse arguments

Split $ARGUMENTS on the first comma to get `project_name` and `version_string`.
- If either value is missing, ask the user before continuing.
- Fuzzy-match `project_name` against numbered folders under `/Projects/` (e.g. "InstaPuppeteer" matches "02. InstaPuppeteer").

## 2. Read the project note

Find the main project note inside the matched project folder — it shares the folder's name (e.g. `02. InstaPuppeteer.md`).
Read its YAML frontmatter and extract the `github` field.

If `github` is missing from the frontmatter:
- Tell the user exactly which file to edit and what to add, for example:
  ```
  Add this to the frontmatter of /Projects/02. InstaPuppeteer/02. InstaPuppeteer.md:
  github: StereoPT/instapuppeteer
  ```
- Stop and wait for the user to confirm before continuing.

## 3. Find the version note

Search the project folder for a `.md` file whose name contains the version string (e.g. `Alpha v5.0.0`).
- If no match is found, list the available version files and ask the user which one to use.

## 4. Parse the version note

Extract all tasks from the **Tasks** section using this structure:

```
### N. Task Group Name          ← task group (used for scoping)

**Task N.M:** Task Title        ← becomes one GitHub Issue
- [ ] subtask item              ← becomes a checklist item in the issue body
- [ ] subtask item
```

Build a data structure like:
```
[
  {
    group: "Dependency Updates",
    tasks: [
      {
        title: "Audit & Update Dependencies",
        items: ["Review current versions...", "Update Next.js...", ...]
      },
      ...
    ]
  },
  ...
]
```

Strip the `N.` prefix from group names and `Task N.M:` prefix from task titles when building this structure.

## 5. Generate conventional commit titles

For each task, infer a conventional commit style issue title from the task name:
- Pick the appropriate type from: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `ci`
- Use the task group as an optional scope when it adds clarity (e.g. `chore(deps)`)
- Lowercase the description and keep it concise

Examples:
- "Audit & Update Dependencies" → `chore(deps): audit and update dependencies`
- "Create Automator Dockerfile" → `feat(docker): create automator dockerfile`
- "Breaking Change Resolution" → `fix: resolve breaking changes from major version bumps`
- "Database Schema" → `feat(db): create schedule database schema`

## 6. Confirm before creating

Show the user a summary of what will be created:
- The target repo
- Each issue title (conventional commit format), grouped by task group

Ask: "Shall I create these issues on GitHub?" and wait for confirmation before proceeding.

## 7. Create GitHub issues

For each task in each group, create one GitHub issue:

**Title:** the conventional commit style title generated in step 5

**Body:**

First, generate a short 2–3 sentence summary paragraph for the task based on its title, group, and subtask items. It should explain what the task involves and why it matters — written as a concise technical description, not a list.

Then compose the body as:
```markdown
> Part of version **{version_string}**

{generated summary paragraph}

## Subtasks

- [ ] subtask item 1
- [ ] subtask item 2
...
```

Run:
```bash
gh issue create \
  --repo owner/repo \
  --title "chore(deps): audit and update dependencies" \
  --body "..."
```

Create issues sequentially (one at a time) so GitHub rate limits are not hit.

## 8. Report back

After all issues are created, output:
- Total issues created
- A list of each issue with its GitHub URL (returned by `gh issue create`)
- Any failures, with the error message
