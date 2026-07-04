import type { ContextMap, RepoProfile } from "@axis/context-engine";
import type { GeneratedFile, SourceFile } from "./types.js";
import { hasFw, getFw } from "./fw-helpers.js";
import { mdText, mdInline, mdCode, mdCellCode, jsxText, codeComment } from "./md-sanitize.js";
import { displayRoutes } from "./route-utils.js";
import { findFiles, renderExcerpts, fileTree } from "./file-excerpt-utils.js";

// ─── Theme derivation ────────────────────────────────────────────

interface RemotionTheme {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
}

/** Derive a video color palette from the detected framework stack. */
export function deriveRemotionTheme(ctx: ContextMap): RemotionTheme {
  const names = ctx.detection.frameworks.map(f => f.name.toLowerCase());
  const lang = ctx.project_identity.primary_language.toLowerCase();

  // Framework-specific palettes (first match wins)
  if (names.includes("svelte"))          return { bg: "#1a0a00", fg: "#f1f1f1", accent: "#ff3e00", muted: "#7a3a20" };
  if (names.includes("vue"))             return { bg: "#001a0e", fg: "#e8f5e9", accent: "#41b883", muted: "#2d6a4f" };
  if (names.includes("angular"))         return { bg: "#1a0005", fg: "#fce4ec", accent: "#dd0031", muted: "#880e4f" };
  if (names.includes("next.js"))         return { bg: "#000000", fg: "#ffffff", accent: "#ffffff", muted: "#888888" };
  if (names.includes("react"))           return { bg: "#0d1117", fg: "#c9d1d9", accent: "#61dafb", muted: "#30363d" };
  if (names.includes("nuxt"))            return { bg: "#001a0e", fg: "#e8f5e9", accent: "#00dc82", muted: "#2d6a4f" };
  if (names.includes("fastapi"))         return { bg: "#001a1a", fg: "#e0f7fa", accent: "#009688", muted: "#004d40" };
  if (names.includes("django"))          return { bg: "#001a0a", fg: "#e8ffe8", accent: "#0c4b33", muted: "#2e7d32" };
  if (names.includes("flask"))           return { bg: "#0a0a0a", fg: "#f5f5f5", accent: "#888888", muted: "#555555" };
  if (names.includes("gin") || names.includes("chi") || names.includes("fiber") || names.includes("echo"))
                                         return { bg: "#001a24", fg: "#e0f4ff", accent: "#00add8", muted: "#005f73" };

  // Language fallbacks
  if (lang === "python")                 return { bg: "#1a1400", fg: "#fff8e1", accent: "#ffd343", muted: "#7a6a00" };
  if (lang === "go")                     return { bg: "#001a24", fg: "#e0f4ff", accent: "#00add8", muted: "#005f73" };
  if (lang === "rust")                   return { bg: "#1a0a00", fg: "#fff3e0", accent: "#ce422b", muted: "#7a3a20" };
  if (lang === "java" || lang === "kotlin")
                                         return { bg: "#0a1a1a", fg: "#e0f7fa", accent: "#f89820", muted: "#005f73" };
  if (lang === "typescript" || lang === "javascript")
                                         return { bg: "#0f101a", fg: "#e2e8f0", accent: "#3178c6", muted: "#475569" };

  // Default (framework-agnostic indigo)
  return { bg: "#0f0f23", fg: "#e2e8f0", accent: "#6366f1", muted: "#64748b" };
}

// ─── remotion-script.ts ─────────────────────────────────────────

export function generateRemotionScript(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const languages = ctx.detection.languages;
  const abstractions = ctx.ai_context.key_abstractions;
  const compName = id.name.replace(/[^a-zA-Z0-9]/g, "");

  const lines: string[] = [];

  lines.push(`import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";`);
  lines.push("");
  lines.push(`// Auto-generated Remotion composition for ${codeComment(id.name)}`);
  lines.push(`// Scenes: Intro → Tech Stack → Architecture → Key Abstractions → Outro`);
  lines.push("");

  const theme = deriveRemotionTheme(ctx);
  lines.push(`const THEME = {`);
  lines.push(`  bg: "${theme.bg}",`);
  lines.push(`  fg: "${theme.fg}",`);
  lines.push(`  accent: "${theme.accent}",`);
  lines.push(`  muted: "${theme.muted}",`);
  lines.push(`};`);
  lines.push("");

  // Scene: Intro
  lines.push(`function IntroScene() {`);
  lines.push(`  const frame = useCurrentFrame();`);
  lines.push(`  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });`);
  lines.push(`  return (`);
  lines.push(`    <AbsoluteFill style={{ backgroundColor: THEME.bg, justifyContent: "center", alignItems: "center" }}>`);
  lines.push(`      <h1 style={{ color: THEME.fg, fontSize: 72, opacity }}>${jsxText(id.name)}</h1>`);
  lines.push(`      <p style={{ color: THEME.muted, fontSize: 28, opacity }}>${jsxText(id.description ?? "")}</p>`);
  lines.push(`    </AbsoluteFill>`);
  lines.push(`  );`);
  lines.push(`}`);
  lines.push("");

  // Scene: Tech Stack
  lines.push(`function TechStackScene() {`);
  lines.push(`  const frame = useCurrentFrame();`);
  lines.push(`  const items = ${JSON.stringify(frameworks.slice(0, 6))};`);
  lines.push(`  return (`);
  lines.push(`    <AbsoluteFill style={{ backgroundColor: THEME.bg, padding: 60 }}>`);
  lines.push(`      <h2 style={{ color: THEME.accent, fontSize: 48 }}>Tech Stack</h2>`);
  lines.push(`      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 40 }}>`);
  lines.push(`        {items.map((item, i) => {`);
  lines.push(`          const delay = i * 10;`);
  lines.push(`          const opacity = interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });`);
  lines.push(`          return (`);
  lines.push(`            <div key={item} style={{ background: THEME.accent, color: THEME.fg, padding: "12px 24px", borderRadius: 8, fontSize: 24, opacity }}>`);
  lines.push(`              {item}`);
  lines.push(`            </div>`);
  lines.push(`          );`);
  lines.push(`        })}`);
  lines.push(`      </div>`);
  lines.push(`    </AbsoluteFill>`);
  lines.push(`  );`);
  lines.push(`}`);
  lines.push("");

  // Scene: Architecture
  lines.push(`function ArchitectureScene() {`);
  lines.push(`  const frame = useCurrentFrame();`);
  lines.push(`  const patterns = ${JSON.stringify(ctx.architecture_signals.patterns_detected.slice(0, 4))};`);
  lines.push(`  const score = ${Math.round(ctx.architecture_signals.separation_score * 100)};`);
  lines.push(`  return (`);
  lines.push(`    <AbsoluteFill style={{ backgroundColor: THEME.bg, padding: 60 }}>`);
  lines.push(`      <h2 style={{ color: THEME.accent, fontSize: 48 }}>Architecture</h2>`);
  lines.push(`      <p style={{ color: THEME.muted, fontSize: 24, marginTop: 20 }}>Separation Score: {score}/100</p>`);
  lines.push(`      <ul style={{ marginTop: 30 }}>`);
  lines.push(`        {patterns.map((p, i) => (`);
  lines.push(`          <li key={p} style={{ color: THEME.fg, fontSize: 28, marginBottom: 12, opacity: interpolate(frame, [i * 15, i * 15 + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{p}</li>`);
  lines.push(`        ))}`);
  lines.push(`      </ul>`);
  lines.push(`    </AbsoluteFill>`);
  lines.push(`  );`);
  lines.push(`}`);
  lines.push("");

  // Scene: Key Abstractions
  lines.push(`function AbstractionsScene() {`);
  lines.push(`  const frame = useCurrentFrame();`);
  lines.push(`  const items = ${JSON.stringify(abstractions.slice(0, 6))};`);
  lines.push(`  return (`);
  lines.push(`    <AbsoluteFill style={{ backgroundColor: THEME.bg, padding: 60 }}>`);
  lines.push(`      <h2 style={{ color: THEME.accent, fontSize: 48 }}>Key Abstractions</h2>`);
  lines.push(`      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 30 }}>`);
  lines.push(`        {items.map((item, i) => (`);
  lines.push(`          <div key={item} style={{ color: THEME.fg, fontSize: 24, opacity: interpolate(frame, [i * 10, i * 10 + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>`);
  lines.push(`            → {item}`);
  lines.push(`          </div>`);
  lines.push(`        ))}`);
  lines.push(`      </div>`);
  lines.push(`    </AbsoluteFill>`);
  lines.push(`  );`);
  lines.push(`}`);
  lines.push("");

  // Main Composition
  lines.push(`export function ${compName}Video() {`);
  lines.push(`  return (`);
  lines.push(`    <AbsoluteFill>`);
  lines.push(`      <Sequence from={0} durationInFrames={90}><IntroScene /></Sequence>`);
  lines.push(`      <Sequence from={90} durationInFrames={90}><TechStackScene /></Sequence>`);
  lines.push(`      <Sequence from={180} durationInFrames={90}><ArchitectureScene /></Sequence>`);
  lines.push(`      <Sequence from={270} durationInFrames={90}><AbstractionsScene /></Sequence>`);
  lines.push(`    </AbsoluteFill>`);
  lines.push(`  );`);
  lines.push(`}`);

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const mediaFiles = findFiles(files, ["*.mp4", "*.webm", "*.gif", "*.png", "*.jpg", "*.svg", "*.mp3", "*.wav"]);
    if (mediaFiles.length > 0) {
      lines.push("");
      lines.push("// ─── Detected Media Assets ──────────────────────────────");
      for (const mf of mediaFiles.slice(0, 10)) {
        lines.push(`// Asset: ${codeComment(mf.path)} (${mf.size} bytes)`);
      }
    }
  }

  return {
    path: "remotion-script.ts",
    content: lines.join("\n"),
    content_type: "text/typescript",
    program: "remotion",
    description: `Remotion composition with 4 animated scenes for ${id.name}`,
  };
}

// ─── scene-plan.md ──────────────────────────────────────────────

export function generateScenePlan(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);
  const languages = ctx.detection.languages;
  const abstractions = ctx.ai_context.key_abstractions;
  const patterns = ctx.architecture_signals.patterns_detected;
  const entryPoints = ctx.entry_points;

  const lines: string[] = [];

  lines.push(`# Scene Plan — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`Generated: ${ctx.generated_at}`);
  lines.push("");
  lines.push("## Video Overview");
  lines.push("");
  lines.push(`| Property | Value |`);
  lines.push(`|----------|-------|`);
  lines.push(`| Total Scenes | 4 |`);
  lines.push(`| FPS | 30 |`);
  lines.push(`| Total Frames | 360 |`);
  lines.push(`| Duration | 12 seconds |`);
  lines.push(`| Resolution | 1920×1080 |`);
  lines.push("");

  if (ctx.ai_context.project_summary) {
    lines.push("## Project Summary");
    lines.push("");
    lines.push(mdText(ctx.ai_context.project_summary));
    lines.push("");
  }

  // Detected Stack
  if (ctx.detection.frameworks.length > 0) {
    lines.push("## Detected Stack");
    lines.push("");
    lines.push("| Framework | Version | Confidence |");
    lines.push("|-----------|---------|------------|");
    for (const fw of ctx.detection.frameworks) {
      lines.push(`| ${mdInline(fw.name)} | ${mdInline(fw.version ?? "—")} | ${(fw.confidence * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

  lines.push("## Scene Breakdown");
  lines.push("");

  // Scene 1: Intro
  lines.push("### Scene 1: Introduction (0:00–0:03)");
  lines.push("");
  lines.push(`- **Content**: Project name "${mdText(id.name)}" with description`);
  lines.push("- **Animation**: Fade in over 1s");
  lines.push(`- **Visual**: Centered title on dark background`);
  lines.push(`- **Data**: project_identity.name, project_identity.description`);
  lines.push("");

  // Scene 2: Tech Stack
  lines.push("### Scene 2: Tech Stack (0:03–0:06)");
  lines.push("");
  lines.push("- **Content**: Framework badges with staggered reveal");
  lines.push(`- **Frameworks**: ${mdText(frameworks.join(", ") || "None detected")}`);
  lines.push(`- **Languages**: ${languages.map(l => `${mdText(l.name)} (${l.loc_percent}%)`).join(", ")}`);
  lines.push("- **Animation**: Staggered fade-in, 0.3s delay per item");
  lines.push("- **Visual**: Pill badges in accent color");
  lines.push("");

  // Scene 3: Architecture
  lines.push("### Scene 3: Architecture (0:06–0:09)");
  lines.push("");
  lines.push("- **Content**: Architecture patterns and separation score");
  lines.push(`- **Patterns**: ${mdText(patterns.join(", ") || "None detected")}`);
  lines.push(`- **Separation Score**: ${Math.round(ctx.architecture_signals.separation_score * 100)}/100`);
  lines.push("- **Animation**: List items reveal sequentially");
  lines.push("- **Visual**: Bullet list with score indicator");
  lines.push("");

  // Scene 4: Key Abstractions
  lines.push("### Scene 4: Key Abstractions (0:09–0:12)");
  lines.push("");
  lines.push("- **Content**: Core abstractions and concepts");
  lines.push(`- **Items**: ${mdText(abstractions.slice(0, 6).join(", ") || "None detected")}`);
  lines.push("- **Animation**: Staggered reveal from top");
  lines.push("- **Visual**: Arrow-prefixed list items");
  lines.push("");

  // Scene 5: Domain Models (conditional)
  const models = ctx.domain_models;
  if (models.length > 0) {
    lines.push("### Scene 5: Domain Models (0:12–0:15)");
    lines.push("");
    lines.push("- **Content**: Detected domain model entities");
    lines.push(`- **Models**: ${models.slice(0, 6).map(m => `${mdText(m.name)} (${mdText(m.kind)}, ${m.field_count} fields)`).join("; ")}`);
    lines.push(`- **Total**: ${models.length} model${models.length === 1 ? "" : "s"} detected`);
    lines.push("- **Animation**: Entity cards fade in with field-count pill badges");
    lines.push("- **Visual**: Grid of entity cards with kind and field count");
    lines.push("");
  }

  lines.push("## Narration Script");
  lines.push("");
  lines.push(`> This is ${mdText(id.name)}, a ${mdText(id.type)} built with ${mdText(id.primary_language)}.`);
  lines.push(`> The tech stack includes ${mdText(frameworks.slice(0, 3).join(", ") || id.primary_language)}.`);
  lines.push(`> The architecture scores ${Math.round(ctx.architecture_signals.separation_score * 100)} out of 100 for separation.`);
  lines.push(`> Key abstractions include ${mdText(abstractions.slice(0, 3).join(", ") || "the core modules")}.`);
  lines.push("");

  lines.push("## Extension Points");
  lines.push("");
  lines.push("- Add Scene 5: Dependency graph visualization");
  lines.push("- Add Scene 6: Route map overlay");
  lines.push(`- Add Scene 7: ${entryPoints.length} entry points walkthrough`);
  lines.push("- Add audio track with project-appropriate music");
  lines.push("- Add branded intro/outro with logo");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const mediaFiles = findFiles(files, ["*.mp4", "*.webm", "*.gif", "*.png", "*.jpg", "*.svg"]);
    if (mediaFiles.length > 0) {
      lines.push("## Available Media Assets");
      lines.push("");
      for (const mf of mediaFiles.slice(0, 12)) {
        lines.push(`- \`${mdCode(mf.path)}\` (${mf.size} bytes)`);
      }
      lines.push("");
    }
  }

  return {
    path: "scene-plan.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "remotion",
    description: "Scene-by-scene video plan with timing, content, and narration script",
  };
}

// ─── render-config.json ─────────────────────────────────────────

export function generateRenderConfig(ctx: ContextMap, profile: RepoProfile, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const compName = id.name.replace(/[^a-zA-Z0-9]/g, "");
  const routes = displayRoutes(ctx.routes);
  const models = ctx.domain_models;
  const hotspots = ctx.dependency_graph.hotspots;
  const abstractions = ctx.ai_context.key_abstractions;
  const languages = ctx.detection.languages;

  // Build dynamic scenes based on available data
  const scenes: { id: string; from: number; duration: number; label: string; data_points: number }[] = [];
  let frame = 0;
  const SCENE_DUR = 90;

  scenes.push({ id: "intro", from: frame, duration: SCENE_DUR, label: "Introduction", data_points: 1 });
  frame += SCENE_DUR;

  scenes.push({ id: "tech-stack", from: frame, duration: SCENE_DUR, label: "Tech Stack", data_points: ctx.detection.frameworks.length + languages.length });
  frame += SCENE_DUR;

  if (routes.length > 0) {
    scenes.push({ id: "api-surface", from: frame, duration: SCENE_DUR, label: `API Surface (${routes.length} routes)`, data_points: routes.length });
    frame += SCENE_DUR;
  }

  if (models.length > 0) {
    scenes.push({ id: "data-model", from: frame, duration: SCENE_DUR, label: `Data Model (${models.length} entities)`, data_points: models.length });
    frame += SCENE_DUR;
  }

  if (hotspots.length > 0) {
    scenes.push({ id: "complexity", from: frame, duration: SCENE_DUR, label: `Complexity Hotspots (${hotspots.length})`, data_points: hotspots.length });
    frame += SCENE_DUR;
  }

  scenes.push({ id: "architecture", from: frame, duration: SCENE_DUR, label: "Architecture", data_points: ctx.architecture_signals.patterns_detected.length });
  frame += SCENE_DUR;

  if (abstractions.length > 0) {
    scenes.push({ id: "abstractions", from: frame, duration: SCENE_DUR, label: "Key Abstractions", data_points: abstractions.length });
    frame += SCENE_DUR;
  }

  const config = {
    project: id.name,
    generated_at: ctx.generated_at,
    composition: {
      id: `${compName}Video`,
      width: 1920,
      height: 1080,
      fps: 30,
      durationInFrames: frame,
    },
    scenes,
    render: {
      codec: "h264",
      imageFormat: "jpeg",
      quality: 80,
      outputLocation: `out/${compName}.mp4`,
      concurrency: 4,
      overwrite: true,
    },
    theme: (() => {
      const t = deriveRemotionTheme(ctx);
      return {
        background: t.bg,
        foreground: t.fg,
        accent: t.accent,
        muted: t.muted,
        fontFamily: "Inter, system-ui, sans-serif",
      };
    })(),
    scene_data: {
      tech_stack: {
        frameworks: ctx.detection.frameworks.map(f => ({
          name: f.name, version: f.version ?? null, confidence: f.confidence,
        })),
        languages: languages.slice(0, 6).map(l => ({
          name: l.name, loc: l.loc, percent: l.loc_percent,
        })),
        build_tools: ctx.detection.build_tools,
        test_frameworks: ctx.detection.test_frameworks,
      },
      api_surface: routes.length > 0 ? {
        total_routes: routes.length,
        routes: routes.slice(0, 20).map(r => ({ method: r.method, path: r.path, source: r.source_file })),
      } : null,
      data_model: models.length > 0 ? {
        total_models: models.length,
        models: models.slice(0, 15).map(m => ({ name: m.name, kind: m.kind, fields: m.field_count })),
      } : null,
      hotspots: hotspots.length > 0 ? hotspots.slice(0, 10).map(h => ({
        path: h.path, inbound: h.inbound_count, outbound: h.outbound_count, risk: h.risk_score,
      })) : null,
      architecture: {
        separation_score: ctx.architecture_signals.separation_score,
        patterns: ctx.architecture_signals.patterns_detected,
        layers: ctx.architecture_signals.layer_boundaries.slice(0, 8).map(lb => ({
          name: lb.layer, dir_count: lb.directories.length,
        })),
      },
      abstractions: abstractions.length > 0 ? abstractions : null,
    },
    detected_stack: {
      primary_language: id.primary_language,
      total_files: ctx.structure.total_files,
      total_loc: ctx.structure.total_loc,
    },
    source_media_files: null as string[] | null,
  };

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const media = findFiles(files, ["*.mp4", "*.webm", "*.gif", "*.png", "*.jpg", "*.svg", "*.mp3"]);
    if (media.length > 0) {
      config.source_media_files = media.slice(0, 15).map(f => f.path);
    }
  }

  return {
    path: "render-config.json",
    content: JSON.stringify(config, null, 2),
    content_type: "application/json",
    program: "remotion",
    description: "Remotion render configuration with composition settings, scenes, and output options",
  };
}

// ─── asset-checklist.md ─────────────────────────────────────────

export function generateAssetChecklist(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks.map(f => f.name);

  const lines: string[] = [];

  lines.push(`# Asset Checklist — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`Generated: ${ctx.generated_at}`);
  lines.push("");
  lines.push("## Required Assets");
  lines.push("");
  lines.push("### Fonts");
  lines.push("- [ ] Inter (primary body font)");
  lines.push("- [ ] JetBrains Mono (code snippets)");
  lines.push("");
  lines.push("### Colors");
  const palette = deriveRemotionTheme(ctx);
  lines.push(`- [x] Background: ${palette.bg} (derived from detected stack)`);
  lines.push(`- [x] Foreground: ${palette.fg} (derived from detected stack)`);
  lines.push(`- [x] Accent: ${palette.accent} (derived from detected stack)`);
  lines.push(`- [x] Muted: ${palette.muted} (derived from detected stack)`);
  lines.push("");

  lines.push("### Images");
  lines.push(`- [ ] ${mdText(id.name)} logo (SVG, transparent background)`);
  lines.push("- [ ] Social media preview thumbnail (1200×630)");
  lines.push("- [ ] Video poster frame (1920×1080)");
  lines.push("");

  lines.push("### Framework Logos");
  for (const fw of frameworks.slice(0, 8)) {
    lines.push(`- [ ] ${mdText(fw)} logo (SVG or PNG, transparent)`);
  }
  if (frameworks.length === 0) {
    lines.push(`- [ ] ${mdText(id.primary_language)} logo`);
  }
  lines.push("");

  lines.push("### Audio");
  lines.push("- [ ] Background music track (12s, royalty-free)");
  lines.push("- [ ] Transition sound effect");
  lines.push("- [ ] Optional: voiceover narration (see scene-plan.md)");
  lines.push("");

  lines.push("## Technical Requirements");
  lines.push("");
  lines.push("### Dependencies");
  lines.push("- [ ] `remotion` >= 4.0");
  lines.push("- [ ] `@remotion/cli` (for rendering)");
  lines.push("- [ ] `@remotion/renderer` (for programmatic rendering)");
  lines.push("");

  lines.push("### Environment");
  lines.push("- [ ] Node.js >= 18");
  lines.push("- [ ] Chrome/Chromium (for rendering)");
  lines.push("- [ ] FFmpeg (for H.264 encoding)");
  lines.push("");

  lines.push("## Output Formats");
  lines.push("");
  lines.push("| Format | Resolution | Use Case |");
  lines.push("|--------|-----------|----------|");
  lines.push("| MP4 (H.264) | 1920×1080 | Primary delivery |");
  lines.push("| WebM (VP9) | 1920×1080 | Web embedding |");
  lines.push("| GIF | 800×450 | Social preview |");
  lines.push("| PNG Sequence | 1920×1080 | Custom compositing |");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const assets = findFiles(files, ["*.png", "*.jpg", "*.jpeg", "*.svg", "*.gif", "*.webp", "*.mp3", "*.wav", "*.mp4"]);
    if (assets.length > 0) {
      lines.push("## Detected Assets in Repository");
      lines.push("");
      lines.push("| File | Size |");
      lines.push("|------|------|");
      for (const a of assets.slice(0, 15)) {
        lines.push(`| \`${mdCellCode(a.path)}\` | ${a.size} bytes |`);
      }
      lines.push("");
    }
  }

  return {
    path: "asset-checklist.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "remotion",
    description: "Checklist of required assets, dependencies, and output formats for video rendering",
  };
}

// ─── storyboard.md ──────────────────────────────────────────────

export function generateStoryboard(ctx: ContextMap, files?: SourceFile[]): GeneratedFile {
  const id = ctx.project_identity;
  const frameworks = ctx.detection.frameworks;
  const languages = ctx.detection.languages;
  const abstractions = ctx.ai_context.key_abstractions;
  const hotspots = ctx.dependency_graph.hotspots;

  const lines: string[] = [];
  lines.push(`# Storyboard — ${mdText(id.name)}`);
  lines.push("");
  lines.push(`Generated: ${ctx.generated_at}`);
  lines.push("");
  lines.push("Frame-by-frame storyboard for a 60-second project showcase video.");
  lines.push("");

  // Scene 1: Title Card
  lines.push("## Scene 1: Title Card (0:00–0:05)");
  lines.push("");
  lines.push("```");
  lines.push("┌────────────────────────────────────┐");
  lines.push("│                                    │");
  lines.push(`│          ${mdCode(id.name.toUpperCase()).padStart(Math.floor((20 + id.name.length) / 2)).padEnd(20)}              │`);
  lines.push(`│     ${mdCode(id.description ?? id.type.replace(/_/g, " ")).slice(0, 30).padStart(Math.floor((30 + (id.description ?? id.type).length) / 2)).padEnd(30)}     │`);
  lines.push("│                                    │");
  lines.push("└────────────────────────────────────┘");
  lines.push("```");
  lines.push("");
  lines.push("- **Animation**: Fade in from black, text scales up 95%→100%");
  lines.push("- **Audio**: Subtle synth pad, 4-beat intro");
  lines.push("- **Typography**: Bold heading, light subtitle");
  lines.push("");

  // Scene 2: Tech Stack
  lines.push("## Scene 2: Tech Stack Overview (0:05–0:15)");
  lines.push("");
  lines.push("```");
  lines.push("┌────────────────────────────────────┐");
  lines.push("│  ┌──────┐ ┌──────┐ ┌──────┐       │");
  for (const fw of frameworks.slice(0, 3)) {
    lines.push(`│  │ ${mdCode(fw.name).padEnd(4).slice(0, 4)} │                          │`);
  }
  lines.push("│  └──────┘ └──────┘ └──────┘       │");
  lines.push("│                                    │");
  lines.push("│  Languages:                        │");
  for (const l of languages.slice(0, 3)) {
    lines.push(`│    ${mdCode(l.name).padEnd(12)} ${"█".repeat(Math.round(l.loc_percent / 5))} ${l.loc_percent.toFixed(0)}%     │`);
  }
  lines.push("└────────────────────────────────────┘");
  lines.push("```");
  lines.push("");
  lines.push("- **Animation**: Framework badges fly in from left, language bars grow");
  lines.push("- **Narration**: \"Built with [frameworks], [X]% [primary language]\"");
  lines.push("");

  // Scene 3: Architecture
  lines.push("## Scene 3: Architecture Diagram (0:15–0:30)");
  lines.push("");
  lines.push("```");
  lines.push("┌────────────────────────────────────┐");
  lines.push("│     ┌───────────┐                  │");
  lines.push("│     │  Frontend  │                  │");
  lines.push("│     └─────┬─────┘                  │");
  lines.push("│           │                        │");
  lines.push("│     ┌─────▼─────┐                  │");
  lines.push("│     │    API     │                  │");
  lines.push("│     └─────┬─────┘                  │");
  lines.push("│           │                        │");
  lines.push("│     ┌─────▼─────┐                  │");
  lines.push("│     │  Database  │                  │");
  lines.push("│     └───────────┘                  │");
  lines.push("└────────────────────────────────────┘");
  lines.push("```");
  lines.push("");
  lines.push("- **Animation**: Layers build from bottom up, connections animate between them");
  lines.push("- **Narration**: \"A clean [separation_score]-point architecture with clear boundaries\"");
  if (abstractions.length > 0) {
    lines.push(`- **Labels**: ${mdText(abstractions.slice(0, 4).join(", "))}`);
  }
  lines.push("");

  // Scene 4: Hotspot Visualization
  lines.push("## Scene 4: Code Health (0:30–0:45)");
  lines.push("");
  lines.push("```");
  lines.push("┌────────────────────────────────────┐");
  lines.push("│  Code Health Score                  │");
  lines.push("│  ━━━━━━━━━━━━━━━━━━━ 85/100       │");
  lines.push("│                                    │");
  if (hotspots.length > 0) {
    lines.push("│  Hotspots:                         │");
    for (const h of hotspots.slice(0, 3)) {
      // risk_score is a 0–1 fraction (engine.ts) — the old 0–10 thresholds never
      // fired and "toFixed(0)/10" rendered every hotspot as "0/10" or "1/10".
      const bar = h.risk_score > 0.7 ? "🔴" : h.risk_score > 0.4 ? "🟡" : "🟢";
      lines.push(`│  ${bar} ${mdCode(h.path).slice(-25).padEnd(25)} ${String((h.risk_score * 100).toFixed(0)).padStart(3)}%  │`);
    }
  }
  lines.push("└────────────────────────────────────┘");
  lines.push("```");
  lines.push("");
  lines.push("- **Animation**: Score bar fills up, hotspot bubbles pulse by risk");
  lines.push("- **Narration**: \"[X] hotspot files identified with actionable refactor paths\"");
  lines.push("");

  // Scene 5: Outro
  lines.push("## Scene 5: Closing Card (0:45–0:60)");
  lines.push("");
  lines.push("```");
  lines.push("┌────────────────────────────────────┐");
  lines.push("│                                    │");
  lines.push(`│          ${mdCode(id.name.toUpperCase()).padStart(Math.floor((20 + id.name.length) / 2)).padEnd(20)}              │`);
  lines.push("│                                    │");
  lines.push("│     Analyzed by Axis' Iliad       │");
  lines.push("│                                    │");
  lines.push("│     [ Get Started ]                │");
  lines.push("│                                    │");
  lines.push("└────────────────────────────────────┘");
  lines.push("```");
  lines.push("");
  lines.push("- **Animation**: Fade to branded closing card, CTA button pulses");
  lines.push("- **Audio**: Resolved chord, fade out");
  lines.push("");

  lines.push("## Production Notes");
  lines.push("");
  lines.push("| Parameter | Value |");
  lines.push("|-----------|-------|");
  lines.push("| Duration | 60 seconds |");
  lines.push("| Resolution | 1920×1080 |");
  lines.push("| Frame Rate | 60fps |");
  lines.push("| Scenes | 5 |");
  lines.push("| Transitions | Fade + slide |");
  lines.push("| Music | Ambient electronic, licensed |");
  lines.push("| Voiceover | Optional, see narration notes |");
  lines.push("");

  // ─── Source File Analysis ────────────────────────────────────
  if (files && files.length > 0) {
    const visualFiles = findFiles(files, ["*.png", "*.jpg", "*.svg", "*.gif", "*.webp"]);
    if (visualFiles.length > 0) {
      lines.push("## Available Visual Assets");
      lines.push("");
      for (const vf of visualFiles.slice(0, 10)) {
        lines.push(`- \`${mdCode(vf.path)}\``);
      }
      lines.push("");
    }
  }

  return {
    path: "storyboard.md",
    content: lines.join("\n"),
    content_type: "text/markdown",
    program: "remotion",
    description: "Frame-by-frame storyboard for 60-second project showcase video",
  };
}
