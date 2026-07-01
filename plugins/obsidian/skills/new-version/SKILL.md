---
name: new-version
description: Create a new version note for a project in the Obsidian vault
argument-hint: "[project-name], [version]"
disable-model-invocation: true
---

Create a new version note for a project in the Obsidian vault. Arguments: $ARGUMENTS

$ARGUMENTS contains two values separated by a comma: the project name and the version string.
Example: `05. Debrief, Alpha v1.0.0`

Follow these steps exactly:

1. **Parse $ARGUMENTS** to extract the project name and version string (split on the first comma).
   - If either value is missing or ambiguous, ask the user to provide the missing piece before continuing
   - Match the project name against existing numbered folders under `/Projects/` (fuzzy match is fine, e.g. "Debrief" matches "05. Debrief")
   - Wait for the user's response if anything is unclear before proceeding

2. **Determine the file path**:
   - Find the matching project folder under `/Projects/`
   - Check if a subfolder for the phase already exists inside that project folder
   - Count the existing `.md` files in that phase folder to determine the next sequential number N (if the folder doesn't exist yet, N = 1)
   - The file will be created at: `/Projects/XX. ProjectName/Phase/N. Phase vX.Y.Z.md`

3. **Ask the user for the objectives only** — ask what this version aims to achieve (bullet points or prose). Do NOT ask for tasks; you will generate them yourself.
   Wait for the user's response before creating any files.

4. **Generate the full note** from the objectives the user provided:
   - Expand the objectives into 2–3 polished prose paragraphs
   - Derive a set of logical task groups and their subtasks directly from those objectives — do not ask the user for tasks
   - Each task group should map to a clear goal from the objectives
   - Each subtask should have 3–6 concrete, actionable checkbox items

   Use `/Templates/Project Version Template.md` from the vault as the base structure if it exists.
   Otherwise, fall back to the bundled `templates/Project Version.md` in this skill's folder.
   Replace the placeholder text with the generated content.

   - All task items use `- [ ]` (unchecked checkboxes)
   - If the phase folder doesn't exist, it will be created implicitly by placing the file at the correct path

5. **Report back** with:
   - The full path of the created note
   - The sequential number assigned within the phase
