# Skills Directory

Skills in this directory must follow the [Agent Skills specification](https://agentskills.io/specification).

## Required Structure

Each skill is a directory containing at minimum a `SKILL.md` file:

```
skill-name/
└── SKILL.md          # Required
```

## SKILL.md Format

The `SKILL.md` file must contain YAML frontmatter followed by Markdown content.

### Required Frontmatter

```yaml
---
name: skill-name
description: A description of what this skill does and when to use it.
---
```

| Field         | Required | Constraints                                                                                           |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `name`        | Yes      | Max 64 chars. Lowercase letters, numbers, hyphens only. Must match parent directory name.             |
| `description` | Yes      | Max 1024 chars. Describes what the skill does and when to use it. Include keywords for task matching. |

### Optional Frontmatter

| Field           | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `license`       | License name or reference to a bundled license file.               |
| `compatibility` | Environment requirements (max 500 chars).                          |
| `metadata`      | Arbitrary key-value mapping (e.g., author, version).               |
| `allowed-tools` | Space-delimited list of pre-approved tools the skill may use.      |

### Body Content

The Markdown body contains skill instructions. Recommended sections:

- Step-by-step instructions
- Examples of inputs and outputs
- Common edge cases

Keep `SKILL.md` under 500 lines. Move detailed reference material to separate files.

## Optional Directories

- `scripts/` - Executable code agents can run
- `references/` - Additional documentation loaded on demand
- `assets/` - Static resources (templates, images, data files)

## Naming Conventions

Skill names must:
- Be 1-64 characters
- Use only lowercase alphanumeric characters and hyphens (`a-z`, `0-9`, `-`)
- Not start or end with `-`
- Not contain consecutive hyphens (`--`)
- Match the parent directory name

## Validation

Validate skills using the reference library:

```bash
npx skills-ref validate ./my-skill
```
