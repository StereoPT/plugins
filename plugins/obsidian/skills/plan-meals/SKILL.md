---
name: plan-meals
description: Generate a weekly meal plan and save it to the Obsidian vault
argument-hint: "[week? e.g. next, 2026-W26]"
disable-model-invocation: true
---

Generate a weekly meal plan for the Obsidian vault. Optional argument: a week identifier like "next", "2026-W26", or a date (defaults to the current week).

Follow these steps exactly:

1. **Determine the target week:**
   - If $ARGUMENTS is empty or "current", use today's date to calculate the current ISO week.
   - If $ARGUMENTS is "next", use next week.
   - If $ARGUMENTS looks like `YYYY-WNN`, use that week directly.
   - Derive the Monday date for that week. Today is always available from the system context.

2. **Compute the file path:** `/Meals/YYYY-WNN.md` using the ISO week string (e.g. `2026-W26`). Check if the file already exists — if it does, inform the user and ask whether to overwrite or abort before continuing.

3. **Load disliked ingredients** by reading `/Meals/Preferences.md`. Extract every item listed under "Disliked Ingredients". These must not appear in any meal this week — not as a main ingredient, not as a seasoning, not hidden inside a dish name.

4. **Ask the user one question before generating:**
   - "Any preferences or themes for this week? (e.g. Italian week, lighter meals, use up X ingredient) — or just press Enter to skip."
   - Wait for the response before generating meals.

5. **Generate the meal plan** — all meals AI-generated, covering Lunch + Dinner for 2 people (Guido + his wife) every day Monday–Sunday. Apply these guidelines:
   - Strictly exclude all ingredients from step 3.
   - Vary cuisines and proteins across the week (don't repeat the same protein two days in a row).
   - Keep lunches relatively quick/lighter than dinners.
   - Incorporate any preferences from step 4.
   - Include a short, appetising one-liner description per meal (e.g. "Pan-seared salmon with lemon butter and roasted asparagus").

6. **Write the file** at `/Meals/YYYY-WNN.md` using this exact structure:

```
---
week: YYYY-WNN
tags:
  - meal-plan
status: draft
---
# Meal Plan — Week of <Monday date, e.g. "June 23, 2026">

## Monday (Jun 23)
- **Lunch:** <meal>
- **Dinner:** <meal>

## Tuesday (Jun 24)
- **Lunch:** <meal>
- **Dinner:** <meal>

## Wednesday (Jun 25)
- **Lunch:** <meal>
- **Dinner:** <meal>

## Thursday (Jun 26)
- **Lunch:** <meal>
- **Dinner:** <meal>

## Friday (Jun 27)
- **Lunch:** <meal>
- **Dinner:** <meal>

## Saturday (Jun 28)
- **Lunch:** <meal>
- **Dinner:** <meal>

## Sunday (Jun 29)
- **Lunch:** <meal>
- **Dinner:** <meal>
```

7. **Report back** with:
   - The full path of the created file
   - A brief summary of the week's highlights (e.g. "Italian Wednesday, fish on Friday, lighter lunches throughout")
