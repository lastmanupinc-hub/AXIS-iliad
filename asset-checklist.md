# Asset Checklist — axis-toolbox

Generated: 2026-04-14T02:33:20.437Z

## Required Assets

### Fonts
- [ ] Inter (primary body font)
- [ ] JetBrains Mono (code snippets)

### Colors
- [x] Background: #0d1117 (derived from detected stack)
- [x] Foreground: #c9d1d9 (derived from detected stack)
- [x] Accent: #61dafb (derived from detected stack)
- [x] Muted: #30363d (derived from detected stack)

### Images
- [ ] axis-toolbox logo (SVG, transparent background)
- [ ] Social media preview thumbnail (1200×630)
- [ ] Video poster frame (1920×1080)

### Framework Logos
- [ ] React logo (SVG or PNG, transparent)

### Audio
- [ ] Background music track (12s, royalty-free)
- [ ] Transition sound effect
- [ ] Optional: voiceover narration (see scene-plan.md)

## Technical Requirements

### Dependencies
- [ ] `remotion` >= 4.0
- [ ] `@remotion/cli` (for rendering)
- [ ] `@remotion/renderer` (for programmatic rendering)

### Environment
- [ ] Node.js >= 18
- [ ] Chrome/Chromium (for rendering)
- [ ] FFmpeg (for H.264 encoding)

## Output Formats

| Format | Resolution | Use Case |
|--------|-----------|----------|
| MP4 (H.264) | 1920×1080 | Primary delivery |
| WebM (VP9) | 1920×1080 | Web embedding |
| GIF | 800×450 | Social preview |
| PNG Sequence | 1920×1080 | Custom compositing |
