import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";

// Auto-generated Remotion composition for axis-toolbox
// Scenes: Intro → Tech Stack → Architecture → Key Abstractions → Outro

const THEME = {
  bg: "#0d1117",
  fg: "#c9d1d9",
  accent: "#61dafb",
  muted: "#30363d",
};

function IntroScene() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, justifyContent: "center", alignItems: "center" }}>
      <h1 style={{ color: THEME.fg, fontSize: 72, opacity }}>axis-toolbox</h1>
      <p style={{ color: THEME.muted, fontSize: 28, opacity }}>AI-native development operating system. Upload or point at any codebase — get 86 generated artifacts across 18 specialized programs: context maps, debug playbooks, governance files, design tokens, SEO analysis, brand systems, and more.</p>
    </AbsoluteFill>
  );
}

function TechStackScene() {
  const frame = useCurrentFrame();
  const items = ["React"];
  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, padding: 60 }}>
      <h2 style={{ color: THEME.accent, fontSize: 48 }}>Tech Stack</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 40 }}>
        {items.map((item, i) => {
          const delay = i * 10;
          const opacity = interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={item} style={{ background: THEME.accent, color: THEME.fg, padding: "12px 24px", borderRadius: 8, fontSize: 24, opacity }}>
              {item}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function ArchitectureScene() {
  const frame = useCurrentFrame();
  const patterns = ["monorepo","containerized"];
  const score = 0.64;
  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, padding: 60 }}>
      <h2 style={{ color: THEME.accent, fontSize: 48 }}>Architecture</h2>
      <p style={{ color: THEME.muted, fontSize: 24, marginTop: 20 }}>Separation Score: {score}/100</p>
      <ul style={{ marginTop: 30 }}>
        {patterns.map((p, i) => (
          <li key={p} style={{ color: THEME.fg, fontSize: 28, marginBottom: 12, opacity: interpolate(frame, [i * 15, i * 15 + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{p}</li>
        ))}
      </ul>
    </AbsoluteFill>
  );
}

function AbstractionsScene() {
  const frame = useCurrentFrame();
  const items = ["packages/ (monorepo_packages)","apps/ (monorepo_apps)","payment-processing-output/ (project_directory)","examples/ (project_directory)","search/ (project_directory)","algorithmic/ (project_directory)"];
  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, padding: 60 }}>
      <h2 style={{ color: THEME.accent, fontSize: 48 }}>Key Abstractions</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 30 }}>
        {items.map((item, i) => (
          <div key={item} style={{ color: THEME.fg, fontSize: 24, opacity: interpolate(frame, [i * 10, i * 10 + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            → {item}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

export function axistoolboxVideo() {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={90}><IntroScene /></Sequence>
      <Sequence from={90} durationInFrames={90}><TechStackScene /></Sequence>
      <Sequence from={180} durationInFrames={90}><ArchitectureScene /></Sequence>
      <Sequence from={270} durationInFrames={90}><AbstractionsScene /></Sequence>
    </AbsoluteFill>
  );
}