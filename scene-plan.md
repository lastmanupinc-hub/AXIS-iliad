# Scene Plan — axis-toolbox

Generated: 2026-04-14T03:15:00.662Z

## Video Overview

| Property | Value |
|----------|-------|
| Total Scenes | 4 |
| FPS | 30 |
| Total Frames | 360 |
| Duration | 12 seconds |
| Resolution | 1920×1080 |

## Project Summary

axis-toolbox is a monorepo built with TypeScript using React. It contains 500 files across 20 top-level directories. It defines 152 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Scene Breakdown

### Scene 1: Introduction (0:00–0:03)

- **Content**: Project name "axis-toolbox" with description
- **Animation**: Fade in over 1s
- **Visual**: Centered title on dark background
- **Data**: project_identity.name, project_identity.description

### Scene 2: Tech Stack (0:03–0:06)

- **Content**: Framework badges with staggered reveal
- **Frameworks**: React
- **Languages**: TypeScript (69.5%), JSON (11.1%), YAML (9.6%), Markdown (8.2%), CSS (0.8%), JavaScript (0.6%), HTML (0.1%), Dockerfile (0%), PowerShell (0%), Shell (0%)
- **Animation**: Staggered fade-in, 0.3s delay per item
- **Visual**: Pill badges in accent color

### Scene 3: Architecture (0:06–0:09)

- **Content**: Architecture patterns and separation score
- **Patterns**: monorepo, containerized
- **Separation Score**: 0.64/100
- **Animation**: List items reveal sequentially
- **Visual**: Bullet list with score indicator

### Scene 4: Key Abstractions (0:09–0:12)

- **Content**: Core abstractions and concepts
- **Items**: packages/ (monorepo_packages), apps/ (monorepo_apps), payment-processing-output/ (project_directory), examples/ (project_directory), search/ (project_directory), algorithmic/ (project_directory)
- **Animation**: Staggered reveal from top
- **Visual**: Arrow-prefixed list items

### Scene 5: Domain Models (0:12–0:15)

- **Content**: Detected domain model entities
- **Models**: AuthContext (interface, 3 fields); EnvSpec (interface, 5 fields); ValidationError (interface, 2 fields); ValidationResult (interface, 3 fields); ZipEntry (interface, 4 fields); IntentCapture (interface, 5 fields)
- **Total**: 152 models detected
- **Animation**: Entity cards fade in with field-count pill badges
- **Visual**: Grid of entity cards with kind and field count

## Narration Script

> This is axis-toolbox, a monorepo built with TypeScript.
> The tech stack includes React.
> The architecture scores 0.64 out of 100 for separation.
> Key abstractions include packages/ (monorepo_packages), apps/ (monorepo_apps), payment-processing-output/ (project_directory).

## Extension Points

- Add Scene 5: Dependency graph visualization
- Add Scene 6: Route map overlay
- Add Scene 7: 0 entry points walkthrough
- Add audio track with project-appropriate music
- Add branded intro/outro with logo
