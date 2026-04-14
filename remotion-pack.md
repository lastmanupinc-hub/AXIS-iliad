# AXIS Toolbox — Remotion Video Pack

## Video Specification

| Property | Value |
|----------|-------|
| Title | "AXIS Toolbox: From Upload to 87 Artifacts" |
| Duration | 60 seconds |
| Resolution | 1920 × 1080 (16:9) |
| FPS | 30 |
| Style | Dark UI motion graphics, midnight_command theme |
| Audio | Ambient electronic, minimal — focus on visual |
| Target | Product demo, landing page hero, social media |

---

## Storyboard: 7 Scenes

### Scene 1: The Problem (0:00 – 0:08)
**Duration**: 8 seconds
**Visual**: Split screen. Left: developer typing in VS Code (dark theme). Right: AI assistant producing generic, context-free code suggestions. Red pulse on wrong suggestions.
**Text Overlay**: "Your AI assistant doesn't know your codebase."
**Motion**: Slow zoom into the AI response, revealing it's generic boilerplate.
**Transition**: Hard cut to black.

**Remotion Component**:
```tsx
<Scene1_Problem>
  <SplitScreen left={<EditorPanel />} right={<AIPanel suggestions={generic} />} />
  <TextOverlay text="Your AI assistant doesn't know your codebase." />
  <PulseEffect color="#f85149" targets={wrongSuggestions} />
</Scene1_Problem>
```

---

### Scene 2: Upload (0:08 – 0:16)
**Duration**: 8 seconds
**Visual**: AXIS Toolbox dashboard (dark, midnight_command theme). A ZIP file drags into the upload zone. Progress bar fills with cyan glow. Upload complete toast appears.
**Text Overlay**: "Upload your repo. One file."
**Motion**: File drag animation → progress fill (left to right) → success toast slides in from bottom-right.
**Transition**: Morph the upload card into the analysis view.

**Remotion Component**:
```tsx
<Scene2_Upload>
  <Dashboard theme="midnight_command">
    <DragAnimation file="project.zip" />
    <ProgressBar fill={spring({ from: 0, to: 100 })} color="#58a6ff" />
    <Toast type="success" message="Snapshot created" />
  </Dashboard>
  <TextOverlay text="Upload your repo. One file." />
</Scene2_Upload>
```

---

### Scene 3: The Pipeline (0:16 – 0:26)
**Duration**: 10 seconds
**Visual**: Horizontal pipeline visualization. Five nodes light up sequentially: Upload → repo-parser → context-engine → generator-core → Artifacts. Each node has a brief data burst animation showing what it does.
**Text Overlay**: "5 stages. 80 generators. Deterministic output."
**Motion**: Left-to-right cascade. Each node pulses cyan when active, then settles to green (complete). Data particles flow between nodes.
**Transition**: Camera pushes into the "Artifacts" node.

**Remotion Component**:
```tsx
<Scene3_Pipeline>
  <PipelineView stages={['Upload', 'repo-parser', 'context-engine', 'generator-core', 'Artifacts']}>
    {stages.map((stage, i) => (
      <PipelineNode key={stage} active={frame > i * 6} completed={frame > (i + 1) * 6}>
        <DataBurst count={stage === 'generator-core' ? 80 : 10} />
      </PipelineNode>
    ))}
    <ParticleFlow color="#58a6ff" />
  </PipelineView>
  <TextOverlay text="5 stages. 80 generators. Deterministic output." />
</Scene3_Pipeline>
```

---

### Scene 4: Generated Artifacts Grid (0:26 – 0:36)
**Duration**: 10 seconds
**Visual**: 4×4 grid of generated file cards, each representing a program. Cards flip in sequentially with a cascade animation. Each card shows: program name, generator count, Grade A badge.
**Text Overlay**: "17 programs. From debug playbooks to video storyboards."
**Motion**: Cards cascade in from bottom, 0.1s stagger. On hover-equivalent (middle of scene), one card expands to show file contents.
**Transition**: Grid collapses into three featured files.

**Remotion Component**:
```tsx
<Scene4_ArtifactGrid>
  <Grid columns={4} rows={4}>
    {programs.map((p, i) => (
      <ProgramCard
        key={p.name}
        name={p.name}
        generators={p.generators}
        grade={p.grade}
        delay={i * 3}
        expanded={i === 6 && frame > 150}
      />
    ))}
  </Grid>
  <TextOverlay text="17 programs. From debug playbooks to video storyboards." />
</Scene4_ArtifactGrid>
```

---

### Scene 5: AI Context Files (0:36 – 0:44)
**Duration**: 8 seconds
**Visual**: Three floating file previews, stacked with depth: AGENTS.md, CLAUDE.md, .cursorrules. Each file scrolls its real content. The files then merge/connect into a VS Code sidebar showing them loaded as context.
**Text Overlay**: "Generated context files. Loaded by your AI tools."
**Motion**: Files float in with parallax depth. Content scrolls at different speeds. Merge animation connects them to the IDE.
**Transition**: Dissolve to the IDE with context loaded.

**Remotion Component**:
```tsx
<Scene5_AIContext>
  <ParallaxStack depth={3}>
    <FloatingFile name="AGENTS.md" content={agentsMd} scrollSpeed={0.8} z={0} />
    <FloatingFile name="CLAUDE.md" content={claudeMd} scrollSpeed={1.0} z={1} />
    <FloatingFile name=".cursorrules" content={cursorRules} scrollSpeed={0.6} z={2} />
  </ParallaxStack>
  <MergeAnimation target={<IDESidebar />} />
  <TextOverlay text="Generated context files. Loaded by your AI tools." />
</Scene5_AIContext>
```

---

### Scene 6: Before/After (0:44 – 0:52)
**Duration**: 8 seconds
**Visual**: Same split screen as Scene 1, but now the right side shows the AI assistant producing *accurate*, context-aware suggestions. Green success pulses. The AGENTS.md file is visible in the context panel.
**Text Overlay**: "Now it knows everything."
**Motion**: Callback to Scene 1 layout. Left side identical. Right side transforms from red (generic) to green (contextual). Counter shows: "Context files loaded: 10"
**Transition**: Right panel fills the entire screen.

**Remotion Component**:
```tsx
<Scene6_BeforeAfter>
  <SplitScreen
    left={<EditorPanel />}
    right={<AIPanel suggestions={contextAware} contextFiles={10} />}
  />
  <Transform from="red" to="green" />
  <TextOverlay text="Now it knows everything." />
</Scene6_BeforeAfter>
```

---

### Scene 7: CTA (0:52 – 1:00)
**Duration**: 8 seconds
**Visual**: Dark background (#0d1117). AXIS Toolbox wordmark centered. Stats fade in below: "17 programs · 80 generators · 2,910 tests". CTA button: "Analyze your repo free →"
**Text Overlay**: Product name and stats.
**Motion**: Wordmark fades in (0.5s), stats type in (character by character, 2s), CTA button slides up (0.3s). Subtle cyan glow on the wordmark.
**Transition**: Hold. End card.

**Remotion Component**:
```tsx
<Scene7_CTA>
  <CenteredLayout bg="#0d1117">
    <FadeIn duration={15}>
      <Wordmark text="AXIS Toolbox" glow="#58a6ff" />
    </FadeIn>
    <TypeWriter text="17 programs · 80 generators · 2,910 tests" delay={15} />
    <SlideUp delay={60}>
      <CTAButton text="Analyze your repo free →" color="#238636" />
    </SlideUp>
  </CenteredLayout>
</Scene7_CTA>
```

---

## Asset List

| Asset | Type | Source | Notes |
|-------|------|--------|-------|
| AXIS Wordmark | SVG | Brand guidelines | Semibold "AXIS" + regular "Toolbox" |
| midnight_command palette | JSON | design-tokens.json | All color values |
| Pipeline node icons | SVG | Custom | 5 stage icons |
| Program card data | JSON | axis_all_tools.yaml | 17 programs with generators/grades |
| AGENTS.md content | Text | Generated output | First 20 lines for scroll preview |
| CLAUDE.md content | Text | Generated output | Full file (short) |
| .cursorrules content | Text | Generated output | First 15 lines |
| Code editor mockup | Component | Custom | VS Code-style dark theme |
| AI suggestion panels | Component | Custom | Generic vs. contextual comparison |
| Ambient audio track | Audio | Licensed/composed | 60s, electronic, minimal |

## Narration Script (Optional Voice-Over)

> Your AI assistant writes code — but it doesn't know your codebase.
>
> AXIS Toolbox changes that. Upload your repo. One file.
>
> Five stages analyze your code: languages, frameworks, architecture, dependencies, patterns.
>
> Then 80 generators produce structured artifacts across 17 programs.
> Debug playbooks. Brand guidelines. Design tokens. Video storyboards.
>
> The Skills program generates context files — AGENTS.md, CLAUDE.md, .cursorrules — that your AI tools load automatically.
>
> Now your assistant knows your invariants, your patterns, your architecture.
> Every suggestion is grounded in real project context.
>
> AXIS Toolbox. Analyze your repo free.

**Word count**: ~95 words. At 150 WPM narration pace = ~38 seconds. Leaves 22 seconds for visual-only sequences.

---

## Production Notes

| Setting | Value |
|---------|-------|
| Remotion version | 4.x |
| Composition ID | `axis-demo-60s` |
| Width | 1920 |
| Height | 1080 |
| FPS | 30 |
| Total frames | 1800 |
| Output format | MP4 (H.264) |
| Render command | `npx remotion render axis-demo-60s out/axis-demo.mp4` |

### Scene Frame Map

| Scene | Start Frame | End Frame | Duration (frames) |
|-------|------------|-----------|-------------------|
| 1 — Problem | 0 | 240 | 240 |
| 2 — Upload | 240 | 480 | 240 |
| 3 — Pipeline | 480 | 780 | 300 |
| 4 — Artifact Grid | 780 | 1080 | 300 |
| 5 — AI Context | 1080 | 1320 | 240 |
| 6 — Before/After | 1320 | 1560 | 240 |
| 7 — CTA | 1560 | 1800 | 240 |
