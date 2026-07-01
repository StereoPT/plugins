---
name: new-project
description: Create a new numbered project note in the Obsidian vault
argument-hint: "[project-name]"
disable-model-invocation: true
---

Create a new project in the Obsidian vault. The project name is: $ARGUMENTS

Follow these steps exactly:

1. **Determine the next project number** by listing `/Projects/` and finding the highest existing `XX.` prefix among numbered folders. Increment by 1 and zero-pad to 2 digits (e.g. `05`).

2. **Ask the user for the following before creating any files:**
   - A short description of what the project does and who it's for
   - The tech stack they plan to use (frameworks, libraries, tools)
   Wait for the user's response before proceeding.

3. **Create the project folder and main note** at `/Projects/XX. <Name>/XX. <Name>.md`.
   - Use `/Templates/Projects Template.md` from the vault as the base if it exists.
   - Otherwise, fall back to the bundled `templates/Project.md` in this skill's folder.
   - Fill in the template with the project name and the information gathered above.

4. **Report back** with:
   - The full path of the created note
   - The project number assigned
