---
name: graphite-stack
description: Create a logical Graphite PR stack from uncommitted changes. Analyzes modified and untracked files, groups them into logical PRs (schemas, services, integrations, etc.), and creates a stacked PR series using the Graphite CLI.
---

# Graphite Stack Skill

This skill analyzes uncommitted changes in the repository and creates a logical Graphite PR stack, grouping related files into separate PRs for easier code review.

## Instructions

When the user invokes `/graphite-stack` or asks to create a Graphite PR stack, follow these steps:

### Step 1: Analyze Changes

Run `git status` to identify all modified and untracked files:

```bash
git status --porcelain
```

### Step 2: Identify Changed Areas

Analyze the changed files and identify which areas of the codebase are affected:

| Area | Path Patterns | Examples |
| ---- | ------------- | -------- |
| **Database/Schema** | `packages/schemas/src/*/db.ts`, `packages/schemas/package.json` | Drizzle tables, schema exports |
| **Backend Services** | `functions/src/resources/*/` | Repositories, services, Zod schemas |
| **Backend Utils** | `functions/src/utils/`, `functions/src/integrations/*/utils/` | Helpers, constants, utilities |
| **Integrations** | `functions/src/integrations/*/` | Third-party integration handlers |
| **Temporal** | `functions/src/temporal/` | Workflows, activities |
| **API/Webhooks** | `functions/src/resources/*/webhooks/`, `functions/src/api/` | Endpoints, webhook handlers |
| **tRPC Routers** | `functions/src/trpc/routers/` | API route definitions |
| **Frontend Components** | `client/src/components/` | React components |
| **Frontend Pages** | `client/src/pages/` | Next.js pages |
| **Frontend Utils** | `client/src/utils/`, `client/src/hooks/` | Frontend helpers, custom hooks |
| **Frontend State** | `client/src/store/` | Zustand stores |
| **UI Library** | `client/src/planned-ui/` | Design system components |
| **Config/Other** | Root config files, docs, scripts | Configuration, documentation |

### Step 3: Ask User Questions

Use the `askQuestions`/`ask_questions`/`AskUserQuestion` tool to ask:

1. **Feature name**: A short identifier for the feature (e.g., `event-general-email`)
   - This will be used in branch names and commit messages
   - Branch names follow conventional commits: `<type>/[feature-name]-base` (e.g., `feat/event-email-base`, `fix/user-auth-base`)

2. **Splitting strategy**: Based on the changed files detected, ask how they want to split the work:

   Present the detected areas and offer these common strategies:

   **For backend-only changes:**
   - **By layer**: Schema → Repository/Service → Integration → API (bottom-up dependencies)
   - **By domain**: Group all files related to each domain/resource together
   - **Single PR**: All changes in one PR (for small changes)

   **For frontend-only changes:**
   - **By feature**: Group by UI feature or user flow
   - **By component type**: Pages → Components → Utils/Hooks → State
   - **By domain**: Group all files related to each domain together
   - **Single PR**: All changes in one PR (for small changes)

   **For full-stack changes:**
   - **Backend first**: All backend changes, then all frontend changes
   - **By feature slice**: Schema + Backend + Frontend for each feature together
   - **By layer (full)**: Schema → Backend Services → Backend API → Frontend State → Frontend UI
   - **Custom**: Let user specify their own grouping

   Show the user which files fall into which areas and let them choose or customize.

**Note**: All stacks use a feature base branch following conventional commits format (`<type>/[feature-name]-base`) as a custom trunk, and are created in a git worktree at `../[feature-name]/` to keep the main working directory clean. Use `feat/` for new features, `fix/` for bug fixes, `refactor/` for refactoring, etc.

### Step 4: Generate Commands

Output a series of executable commands for the user to run.

---

## Workflow: Feature Base Branch with Worktree

All stacks use this workflow to isolate work and handle conflicts with master only once at the end.

**Why feature base branches?**

- Acts as a snapshot of master at a point in time
- All PRs in the stack target the feature base (not master directly)
- Once all PRs are merged into the feature base, rebase onto master once
- Conflicts are handled in one place, not across multiple PRs

```bash
# 1. Ensure master is up to date
git checkout master
git pull origin master

# 2. Create the feature base branch (this will be the trunk for our stack)
git checkout -b feat/[feature-name]-base
git push -u origin feat/[feature-name]-base

# 3. Create a worktree for this feature work (starting from the feature base)
cd ..
git worktree add planned-[feature-name] feat/[feature-name]-base
cd planned-[feature-name]

# 4. Register the feature base as a trunk in Graphite
gt trunk --add feat/[feature-name]-base

# 5. Copy your uncommitted changes to the worktree (if needed)
# If you have uncommitted changes in the main repo, copy them:
# cp -r ../planned/path/to/changed/files ./path/to/changed/files

# 6. PR 1: [Category Name]
git add [files...]
gt create --message "<type>([feature-name]): [description in lowercase imperative]"

# 7. PR 2: Database Migration (if schema changes exist)
# Generate migration from schema changes
cd functions && pnpm dlx drizzle-kit generate --name [feature-name]
cd ..
git add functions/drizzle/
gt create --message "feat([feature-name]): add database migration"

# 8. PR 3: [Next Category Name]
git add [files...]
gt create --message "feat([feature-name]): [Description]"

# ... repeat for each category with changes

# 9. Submit the entire stack (PRs will target the feature base branch)
gt submit --stack

# === AFTER ALL PRs ARE MERGED INTO THE FEATURE BASE ===

# 10. Sync and rebase the feature base onto master (handle conflicts once)
git checkout feat/[feature-name]-base
git pull origin feat/[feature-name]-base
git rebase origin/master
# Resolve any conflicts here - this is the ONE place you handle them
git push --force-with-lease origin feat/[feature-name]-base

# 11. Create a final PR from feature base to master (or merge directly)
# Option A: Create a PR on GitHub from feat/[feature-name]-base -> master
# Option B: Fast-forward merge if no conflicts after rebase
git checkout master
git merge feat/[feature-name]-base
git push origin master

# 12. Cleanup
cd ../planned
git worktree remove ../planned-[feature-name]
git branch -d feat/[feature-name]-base
git push origin --delete feat/[feature-name]-base
```

---

### Step 5: Migration Generation Details

When the changed files include database schema changes (`packages/schemas/src/*/db.ts`), a migration PR should be generated **immediately after** the schema PR:

1. **Migration command**: `drizzle-kit generate --name [feature-name]`
   - This runs non-interactively and generates migration files in `functions/drizzle/`
   - The migration name should match the feature name for traceability

2. **Migration files to add**: `functions/drizzle/` (the new migration SQL and metadata files)

3. **Important notes**:
   - The migration PR must come **after** the schema PR in the stack (it depends on the schema changes)
   - If drizzle-kit detects ambiguous changes (like column renames), it may prompt for clarification - the user should handle these interactively
   - Always verify the generated SQL before committing

### Step 6: Conventional Commits Guidelines

All branch names and commit messages follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

#### Branch Naming Convention

Branch names use the format: `<type>/[feature-name]-base`

| Type | When to Use | Example |
| ---- | ----------- | ------- |
| `feat` | New features or functionality | `feat/event-email-base` |
| `fix` | Bug fixes | `fix/user-auth-base` |
| `refactor` | Code restructuring without behavior change | `refactor/user-service-base` |
| `perf` | Performance improvements | `perf/query-optimization-base` |
| `docs` | Documentation changes | `docs/api-reference-base` |
| `chore` | Maintenance, dependencies, config | `chore/deps-update-base` |
| `test` | Adding or updating tests | `test/user-coverage-base` |

#### Commit Message Format

Commit messages use the format: `<type>(<scope>): <description>`

- **type**: The category of change (see table above)
- **scope**: The feature name (kebab-case)
- **description**: Imperative mood, lowercase, no period (e.g., "add user authentication")

#### Valid Commit Types

| Type | Description |
| ---- | ----------- |
| `feat` | New functionality, components, or features |
| `fix` | Bug fixes, error resolutions |
| `docs` | Documentation changes, README updates, code comments |
| `style` | Code style/formatting changes, whitespace, semicolons |
| `refactor` | Code restructuring, improving existing code |
| `perf` | Performance improvements and optimizations |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks, dependency updates, cleanup |
| `ci` | CI/CD changes, GitHub Actions, deployment scripts |
| `build` | Build system changes, webpack, compilation changes |

#### Commit Message Examples by Category

**Backend:**

- **Database Schema**: `feat([feature]): add database schema for [entity]`
- **Database Migration**: `feat([feature]): add database migration`
- **Repository/Service**: `feat([feature]): add repository and service layer`
- **Utils/Helpers**: `feat([feature]): add utility functions and helpers`
- **Integration Module**: `feat([feature]): add integration handlers`
- **Temporal Workflows**: `feat([feature]): add Temporal workflow and activities`
- **API/Webhooks**: `feat([feature]): integrate with [system] webhook`
- **tRPC Routers**: `feat([feature]): add tRPC routes for [entity]`

**Frontend:**

- **Pages**: `feat([feature]): add [page-name] page`
- **Components**: `feat([feature]): add [component-name] component`
- **State/Store**: `feat([feature]): add [store-name] state management`
- **Hooks/Utils**: `feat([feature]): add [hook/util-name] utilities`
- **UI Library**: `feat([feature]): add [component] to design system`

**Full-stack / General:**

- **Feature slice**: `feat([feature]): add [feature-name] feature`
- **Config/Other**: `chore([feature]): update configuration`
- **Bug fix**: `fix([feature]): resolve [issue description]`
- **Refactoring**: `refactor([feature]): simplify [component] logic`
- **Tests**: `test([feature]): add unit tests for [component]`

## Examples

### Backend-Heavy Stack Example (7 PRs - By Layer)

Given these backend-focused changed files, user chose **"By layer"** splitting strategy:

```text
packages/schemas/src/event-emails/db.ts
packages/schemas/src/event-emails/index.ts
packages/schemas/package.json
functions/src/resources/event-emails/event-emails-repo.ts
functions/src/resources/event-emails/event-emails-service.ts
functions/src/integrations/event-email/utils/regexp.ts
functions/src/integrations/event-email/handler.ts
functions/src/temporal/workflows/event-email/index.ts
functions/src/temporal/activities/event-email-activities.ts
functions/src/resources/communications/webhooks/parse-emails.ts
```

```bash
# 1. Ensure master is up to date
git checkout master
git pull origin master

# 2. Create the feature base branch
git checkout -b feat/event-email-base
git push -u origin feat/event-email-base

# 3. Create a worktree for this feature
cd ..
git worktree add planned-event-email feat/event-email-base
cd planned-event-email

# 4. Register the feature base as a trunk in Graphite
gt trunk --add feat/event-email-base

# 5. PR 1: Database schema and exports
git add packages/schemas/src/event-emails/ packages/schemas/package.json
gt create --message "feat(event-email): add database schema for event emails"

# 6. PR 2: Database migration
cd functions && pnpm dlx drizzle-kit generate --name event-email
cd ..
git add functions/drizzle/
gt create --message "feat(event-email): add database migration"

# 7. PR 3: Repository and service layer
git add functions/src/resources/event-emails/
gt create --message "feat(event-email): add repository and service layer"

# 8. PR 4: Email utils
git add functions/src/integrations/event-email/utils/
gt create --message "feat(event-email): add email parsing utilities"

# 9. PR 5: Integration handlers
git add functions/src/integrations/event-email/
gt create --message "feat(event-email): add integration handlers"

# 10. PR 6: Temporal workflow and activities
git add functions/src/temporal/workflows/event-email/ functions/src/temporal/activities/event-email-activities.ts
gt create --message "feat(event-email): add Temporal workflow and activities"

# 11. PR 7: Webhook integration
git add functions/src/resources/communications/webhooks/parse-emails.ts
gt create --message "feat(event-email): integrate with SendGrid webhook"

# 12. Submit the entire stack
gt submit --stack

# === AFTER ALL PRs ARE MERGED INTO THE FEATURE BASE ===

# 13. Rebase feature base onto master and merge
git checkout feat/event-email-base
git pull origin feat/event-email-base
git rebase origin/master
git push --force-with-lease origin feat/event-email-base

# 14. Merge to master (or create a PR)
git checkout master
git merge feat/event-email-base
git push origin master

# 15. Cleanup
cd ../planned
git worktree remove ../planned-event-email
git branch -d feat/event-email-base
git push origin --delete feat/event-email-base
```

### Small Full-Stack Example (2 PRs - Backend First)

Given these full-stack changed files, user chose **"Backend first"** splitting strategy:

```text
functions/src/resources/users/user-service.ts
functions/src/resources/users/user-repo.ts
client/src/components/page/users/UserProfile.tsx
```

```bash
# 1. Ensure master is up to date
git checkout master
git pull origin master

# 2. Create the feature base branch
git checkout -b feat/user-profile-base
git push -u origin feat/user-profile-base

# 3. Create a worktree
cd ..
git worktree add planned-user-profile feat/user-profile-base
cd planned-user-profile

# 4. Register the feature base as a trunk in Graphite
gt trunk --add feat/user-profile-base

# 5. PR 1: Backend changes
git add functions/src/resources/users/
gt create --message "feat(user-profile): update user service and repository"

# 6. PR 2: Frontend changes
git add client/src/components/page/users/
gt create --message "feat(user-profile): update user profile component"

# 7. Submit the stack
gt submit --stack

# === AFTER ALL PRs ARE MERGED INTO THE FEATURE BASE ===

# 8. Rebase feature base onto master and merge
git checkout feat/user-profile-base
git pull origin feat/user-profile-base
git rebase origin/master
git push --force-with-lease origin feat/user-profile-base

# 9. Merge to master
git checkout master
git merge feat/user-profile-base
git push origin master

# 10. Cleanup
cd ../planned
git worktree remove ../planned-user-profile
git branch -d feat/user-profile-base
git push origin --delete feat/user-profile-base
```

### Frontend-Only Example (3 PRs - By Component Type)

Given these frontend-only changed files:

```text
client/src/pages/events/[eventId]/settings.tsx
client/src/components/page/events/settings/EventSettingsForm.tsx
client/src/components/page/events/settings/EventSettingsHeader.tsx
client/src/components/shared/forms/DateRangePicker.tsx
client/src/hooks/useEventSettings.ts
client/src/store/event-settings-store.ts
```

User chose **"By component type"** splitting strategy:

```bash
# 1. Ensure master is up to date
git checkout master
git pull origin master

# 2. Create the feature base branch
git checkout -b feat/event-settings-base
git push -u origin feat/event-settings-base

# 3. Create a worktree
cd ..
git worktree add planned-event-settings feat/event-settings-base
cd planned-event-settings

# 4. Register the feature base as a trunk in Graphite
gt trunk --add feat/event-settings-base

# 5. PR 1: Shared components and utilities (foundation layer)
git add client/src/components/shared/forms/DateRangePicker.tsx client/src/hooks/useEventSettings.ts
gt create --message "feat(event-settings): add DateRangePicker and useEventSettings hook"

# 6. PR 2: State management and page-specific components
git add client/src/store/event-settings-store.ts client/src/components/page/events/settings/
gt create --message "feat(event-settings): add event settings store and components"

# 7. PR 3: Page integration
git add client/src/pages/events/
gt create --message "feat(event-settings): add event settings page"

# 8. Submit the stack
gt submit --stack

# === AFTER ALL PRs ARE MERGED INTO THE FEATURE BASE ===

# 9. Rebase feature base onto master and merge
git checkout feat/event-settings-base
git pull origin feat/event-settings-base
git rebase origin/master
git push --force-with-lease origin feat/event-settings-base

# 10. Merge to master
git checkout master
git merge feat/event-settings-base
git push origin master

# 11. Cleanup
cd ../planned
git worktree remove ../planned-event-settings
git branch -d feat/event-settings-base
git push origin --delete feat/event-settings-base
```

### Full-Stack Feature Slice Example (3 PRs)

Given these full-stack changes for a new feature:

```text
packages/schemas/src/notifications/db.ts
packages/schemas/src/notifications/schema.ts
packages/schemas/src/notifications/index.ts
functions/src/resources/notifications/notifications-repo.ts
functions/src/resources/notifications/notifications-service.ts
functions/src/trpc/routers/notifications.ts
client/src/components/page/notifications/NotificationList.tsx
client/src/components/page/notifications/NotificationItem.tsx
client/src/pages/notifications/index.tsx
client/src/store/notifications-store.ts
```

User chose **"By feature slice"** splitting strategy (vertical slices):

```bash
# 1. Ensure master is up to date
git checkout master
git pull origin master

# 2. Create the feature base branch
git checkout -b feat/notifications-base
git push -u origin feat/notifications-base

# 3. Create a worktree
cd ..
git worktree add planned-notifications feat/notifications-base
cd planned-notifications

# 4. Register the feature base as a trunk in Graphite
gt trunk --add feat/notifications-base

# 5. PR 1: Database schema and migration
git add packages/schemas/src/notifications/
gt create --message "feat(notifications): add database schema"

cd functions && pnpm dlx drizzle-kit generate --name notifications
cd ..
git add functions/drizzle/
gt create --message "feat(notifications): add database migration"

# 6. PR 2: Backend (service layer + API)
git add functions/src/resources/notifications/ functions/src/trpc/routers/notifications.ts
gt create --message "feat(notifications): add backend service and tRPC routes"

# 7. PR 3: Frontend (complete UI)
git add client/src/components/page/notifications/ client/src/pages/notifications/ client/src/store/notifications-store.ts
gt create --message "feat(notifications): add notifications UI and state"

# 8. Submit the stack
gt submit --stack

# === AFTER ALL PRs ARE MERGED INTO THE FEATURE BASE ===

# 9. Rebase feature base onto master and merge
git checkout feat/notifications-base
git pull origin feat/notifications-base
git rebase origin/master
git push --force-with-lease origin feat/notifications-base

# 10. Merge to master
git checkout master
git merge feat/notifications-base
git push origin master

# 11. Cleanup
cd ../planned
git worktree remove ../planned-notifications
git branch -d feat/notifications-base
git push origin --delete feat/notifications-base
```

## Important Notes

1. **Order matters**: PRs should be stacked so each PR only depends on the ones below it in the stack
2. **Migration placement**: The migration PR must always come immediately after the schema PR
3. **Build validation**: Each PR in the stack should independently compile (run `pnpm run build` to verify)
4. **Empty categories**: Skip categories that have no changed files
5. **Index files**: When adding a new integration/resource, ensure index.ts exports are updated in the same PR or earlier
6. **Default trunk branch**: This repository uses `master` as the default trunk branch, not `main`
7. **Always use feature base branches**: Use `gt trunk --add feat/[feature-name]-base` to register as a custom trunk
8. **Single conflict resolution**: All PRs merge into the feature base first, then rebase onto master once - handling conflicts in one place
9. **Always use worktrees**: All stacks are created in a worktree at `../planned-[feature-name]/` to:
    - Keep main working directory clean and on master for hotfixes
    - Allow working on multiple stacks simultaneously
    - Provide complete isolation for each stack
10. **Modified existing files**: Files that modify existing code (like adding to `schema.ts` or `index.ts`) should go with the PR that introduces the new code they're exporting
11. **Worktree with uncommitted changes**: If you have uncommitted changes in your main repo that need to go into the stack, you'll need to either:
    - Stash them, create the worktree, then apply/copy them over
    - Or manually copy the changed files to the worktree directory
12. **Final merge to master**: After all stack PRs are merged into the feature base, rebase onto master and either:
    - Create a single PR from feature base to master, or
    - Fast-forward merge if clean after rebase

## Starting from Existing Work

If you've already started working on a feature (uncommitted changes or existing commits) and want to convert to the proper worktree + feature base workflow:

### From Uncommitted Changes

```bash
# 1. Note all your changed files
git status --porcelain > /tmp/changes.txt

# 2. Stash your changes temporarily
git stash push -m "WIP: [feature-name] changes"

# 3. Ensure master is up to date
git checkout master
git pull origin master

# 4. Create the feature base branch
git checkout -b feat/[feature-name]-base
git push -u origin feat/[feature-name]-base

# 5. Create the worktree
cd ..
git worktree add planned-[feature-name] feat/[feature-name]-base
cd planned-[feature-name]

# 6. Register the feature base as a trunk
gt trunk --add feat/[feature-name]-base

# 7. Apply your stashed changes
git stash pop

# 8. Now proceed with creating PRs as normal (Step 4 onwards)
```

### From an Existing Branch with Commits

If you've already made commits on a feature branch and want to convert to the stacked PR workflow:

```bash
# 1. Note your current branch name and ensure changes are committed
git status  # Should be clean
CURRENT_BRANCH=$(git branch --show-current)

# 2. Create a patch of all your commits (from where you branched off master)
git format-patch master --stdout > /tmp/feature-changes.patch

# 3. Go to master and update
git checkout master
git pull origin master

# 4. Create the feature base branch
git checkout -b feat/[feature-name]-base
git push -u origin feat/[feature-name]-base

# 5. Create the worktree
cd ..
git worktree add planned-[feature-name] feat/[feature-name]-base
cd planned-[feature-name]

# 6. Register the feature base as a trunk
gt trunk --add feat/[feature-name]-base

# 7. Apply your changes (without committing - we'll re-organize into PRs)
git apply --3way /tmp/feature-changes.patch
# Or if you want to unstage everything for re-organization:
git reset HEAD

# 8. Now you have all your changes as uncommitted files
# Proceed with categorizing and creating PRs (Step 2 onwards)

# 9. (Optional) Delete the old branch once stack is submitted
git branch -D $CURRENT_BRANCH
```

### From a Messy Work-in-Progress State

If you have a mix of committed and uncommitted changes:

```bash
# 1. Commit everything as a WIP commit
git add -A
git commit -m "WIP: checkpoint before restructuring"

# 2. Now follow "From an Existing Branch with Commits" above
```

---

## Handling Edge Cases

### No schema changes

If there are no files in `packages/schemas/src/*/db.ts`, skip the migration generation step entirely.

### Mixed new and modified files

If a category contains both new files and modifications to existing files:

- Group them together if the modifications are directly related (e.g., adding exports for new code)
- Split them if the modifications are independent changes

### Circular dependencies

If files have circular dependencies across categories:

- Combine the dependent categories into a single PR
- Note this in the PR description

### Large PRs

If a single category has many files:

- Consider splitting by sub-feature or component
- Keep related files together for easier review

### Migration conflicts

If drizzle-kit generate produces unexpected results:

- Review the generated SQL carefully
- Consider running `drizzle-kit check` first to see pending changes
- For complex migrations, use `--custom` flag and write SQL manually

### Worktree cleanup

When done with a worktree:

```bash
# From the main repo directory
cd ../planned
git worktree remove ../planned-[feature-name]

# Also clean up the feature base branch after merging to master
git branch -d feat/[feature-name]-base
git push origin --delete feat/[feature-name]-base
```

### Worktree with existing uncommitted changes

If you already have uncommitted changes you want to stack:

```bash
# Option 1: Copy files manually (recommended)
# First, note all your changed files from git status
git worktree add ../planned-[feature-name] master
# Then copy each changed file/directory to the worktree
cp -r path/to/changed/file ../planned-[feature-name]/path/to/changed/file
cd ../planned-[feature-name]

# Option 2: Stash approach
git stash
git worktree add ../planned-[feature-name] master
cd ../planned-[feature-name]
git stash pop  # Note: this pops in the worktree context
```

### Addressing reviewer feedback mid-stack

If you need to make changes to a PR that's not at the top of the stack:

```bash
# Checkout the branch that needs changes
gt checkout [branch-name]

# Make your changes
echo "fix" >> file.js

# Amend the current commit and restack branches above
gt modify --all

# Push the updated stack
gt submit --stack
```

### Syncing with master after changes

If master has been updated while you're working on your stack, you have two options:

```bash
# Option 1: Continue working, handle conflicts at the end (recommended)
# Just keep working - you'll rebase the feature base onto master
# after all PRs are merged into the feature base

# Option 2: Sync mid-development (if you need latest master changes)
# First, sync the feature base with master
git checkout feat/[feature-name]-base
git rebase origin/master
git push --force-with-lease origin feat/[feature-name]-base

# Then restack all branches in Graphite
gt sync
```

### Merging the feature base to master

After all PRs in the stack are merged into the feature base:

```bash
# 1. Pull the latest feature base (with all merged PRs)
git checkout feat/[feature-name]-base
git pull origin feat/[feature-name]-base

# 2. Rebase onto the latest master
git fetch origin master
git rebase origin/master

# 3. Resolve any conflicts (this is the ONE place you handle them)
# If conflicts occur, resolve them, then:
git add .
git rebase --continue

# 4. Push the rebased feature base
git push --force-with-lease origin feat/[feature-name]-base

# 5. Merge to master (choose one approach)
# Option A: Fast-forward merge (if linear history)
git checkout master
git pull origin master
git merge feat/[feature-name]-base
git push origin master

# Option B: Create a PR on GitHub for final review
# Go to GitHub and create PR: feat/[feature-name]-base -> master

# 6. Cleanup
git branch -d feat/[feature-name]-base
git push origin --delete feat/[feature-name]-base
```
