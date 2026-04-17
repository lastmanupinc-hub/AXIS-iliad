# Scene Plan — axis-iliad

Generated: 2026-04-17T13:25:42.741Z

## Video Overview

| Property | Value |
|----------|-------|
| Total Scenes | 4 |
| FPS | 30 |
| Total Frames | 360 |
| Duration | 12 seconds |
| Resolution | 1920×1080 |

## Project Summary

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 163 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Scene Breakdown

### Scene 1: Introduction (0:00–0:03)

- **Content**: Project name "axis-iliad" with description
- **Animation**: Fade in over 1s
- **Visual**: Centered title on dark background
- **Data**: project_identity.name, project_identity.description

### Scene 2: Tech Stack (0:03–0:06)

- **Content**: Framework badges with staggered reveal
- **Frameworks**: React
- **Languages**: TypeScript (73.3%), JSON (10%), YAML (7.6%), Markdown (7%), JavaScript (1.2%), CSS (0.8%), HTML (0.1%), Dockerfile (0%)
- **Animation**: Staggered fade-in, 0.3s delay per item
- **Visual**: Pill badges in accent color

### Scene 3: Architecture (0:06–0:09)

- **Content**: Architecture patterns and separation score
- **Patterns**: monorepo, containerized
- **Separation Score**: 0.65/100
- **Animation**: List items reveal sequentially
- **Visual**: Bullet list with score indicator

### Scene 4: Key Abstractions (0:09–0:12)

- **Content**: Core abstractions and concepts
- **Items**: apps/ (monorepo_apps), packages/ (monorepo_packages), payment-processing-output/ (project_directory), examples/ (project_directory), algorithmic/ (project_directory), artifacts/ (project_directory)
- **Animation**: Staggered reveal from top
- **Visual**: Arrow-prefixed list items

### Scene 5: Domain Models (0:12–0:15)

- **Content**: Detected domain model entities
- **Models**: AuthContext (interface, 3 fields); EnvSpec (interface, 5 fields); ValidationError (interface, 2 fields); ValidationResult (interface, 3 fields); ZipEntry (interface, 4 fields); IntentCapture (interface, 5 fields)
- **Total**: 163 models detected
- **Animation**: Entity cards fade in with field-count pill badges
- **Visual**: Grid of entity cards with kind and field count

## Narration Script

> This is axis-iliad, a monorepo built with TypeScript.
> The tech stack includes React.
> The architecture scores 0.65 out of 100 for separation.
> Key abstractions include apps/ (monorepo_apps), packages/ (monorepo_packages), payment-processing-output/ (project_directory).

## Extension Points

- Add Scene 5: Dependency graph visualization
- Add Scene 6: Route map overlay
- Add Scene 7: 0 entry points walkthrough
- Add audio track with project-appropriate music
- Add branded intro/outro with logo
