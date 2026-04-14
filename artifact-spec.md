{
  "artifact": "ProgramPipeline",
  "version": "1.0.0",
  "type": "interactive-component",
  "language": "vanilla-javascript",
  "dependencies": [],
  "description": "Interactive dashboard component visualizing the AXIS Toolbox 18-program × 87-generator pipeline. Zero dependencies.",
  "entryPoint": "ProgramPipeline.js",
  "mountTarget": "#pipeline",
  "features": [
    "18 program cards with tier badges and grade indicators",
    "Filter by tier (All / Free / Pro)",
    "Click-to-expand generator output list per program",
    "Animated execution pipeline flow diagram",
    "Aggregate stats: total programs, generators, Grade A count",
    "midnight_command dark theme with cyan-orange signaling",
    "Responsive CSS grid layout",
    "No framework dependencies — vanilla JS + CSS"
  ],
  "usage": {
    "html": "<div id=\"pipeline\"></div>\n<script src=\"ProgramPipeline.js\"></script>",
    "programmatic": "const dashboard = new ProgramPipeline(document.getElementById('pipeline'));\ndashboard.render();"
  },
  "dataModel": {
    "program": {
      "name": "string — program display name",
      "tier": "'free' | 'pro'",
      "generators": "number — count of generators in this program",
      "grade": "'A' | 'B' | 'F'",
      "outputs": "string[] — filenames this program generates"
    }
  },
  "interactions": [
    { "action": "Click program card", "result": "Toggles detail panel showing generator output filenames" },
    { "action": "Click tier filter", "result": "Filters grid to show only programs in selected tier" },
    { "action": "Hover program card", "result": "Elevates card with cyan border glow" }
  ]
}
