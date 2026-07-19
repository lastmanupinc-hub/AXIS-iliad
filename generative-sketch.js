/**
 * Axis' Iliad — Generative Topology Visualization
 * Canvas-based particle system that visualizes the package → program → generator DAG.
 * Nodes orbit by type (packages inner, programs mid, generators outer).
 * Edges rendered as flowing particles along connection paths.
 *
 * Usage:
 *   <canvas id="topology" width="1200" height="800"></canvas>
 *   <script src="generative-sketch.js"></script>
 */

(function () {
  const canvas = document.getElementById('topology');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const CX = W / 2;
  const CY = H / 2;

  // Color palette (midnight_command)
  const COLORS = {
    bg: '#0d1117',
    surface: '#161b22',
    border: '#30363d',
    text: '#e6edf3',
    textMuted: '#8b949e',
    cyan: '#58a6ff',
    orange: '#d29922',
    green: '#3fb950',
    red: '#f85149',
    purple: '#d2a8ff',
  };

  // Node definitions
  const packages = [
    { id: 'repo-parser', label: 'repo-parser', angle: 0, radius: 120 },
    { id: 'context-engine', label: 'context-engine', angle: Math.PI / 2, radius: 120 },
    { id: 'snapshots', label: 'snapshots', angle: Math.PI, radius: 120 },
    { id: 'generator-core', label: 'generator-core', angle: (3 * Math.PI) / 2, radius: 120 },
  ];

  const programs = [
    { id: 'Search', generators: 4, tier: 'free', grade: 'A' },
    { id: 'Debug', generators: 4, tier: 'free', grade: 'A' },
    { id: 'Skills', generators: 5, tier: 'free', grade: 'A' },
    { id: 'Frontend', generators: 5, tier: 'pro', grade: 'A' },
    { id: 'Theme', generators: 3, tier: 'pro', grade: 'A' },
    { id: 'Brand', generators: 4, tier: 'pro', grade: 'A' },
    { id: 'Notebook', generators: 4, tier: 'pro', grade: 'A' },
    { id: 'Artifacts', generators: 5, tier: 'pro', grade: 'A' },
    { id: 'Optimization', generators: 4, tier: 'pro', grade: 'A' },
    { id: 'Marketing', generators: 6, tier: 'pro', grade: 'A' },
    { id: 'MCP', generators: 4, tier: 'pro', grade: 'A' },
    { id: 'Obsidian', generators: 5, tier: 'pro', grade: 'A' },
    { id: 'Superpowers', generators: 4, tier: 'pro', grade: 'A' },
    { id: 'Remotion', generators: 5, tier: 'pro', grade: 'A' },
    { id: 'Canvas', generators: 4, tier: 'pro', grade: 'A' },
    { id: 'Algorithmic', generators: 5, tier: 'pro', grade: 'A' },
    { id: 'Payment', generators: 4, tier: 'pro', grade: 'F' },
  ];

  // Position programs in a ring
  programs.forEach((p, i) => {
    p.angle = (i / programs.length) * Math.PI * 2;
    p.radius = 280;
    p.x = 0;
    p.y = 0;
  });

  // Particles for edge flow
  const particles = [];
  const MAX_PARTICLES = 200;

  function spawnParticle(fromX, fromY, toX, toY, color) {
    if (particles.length >= MAX_PARTICLES) return;
    particles.push({
      x: fromX,
      y: fromY,
      tx: toX,
      ty: toY,
      t: 0,
      speed: 0.005 + Math.random() * 0.01,
      color: color,
      size: 1.5 + Math.random() * 1.5,
    });
  }

  let frame = 0;

  function update() {
    frame++;

    // Update package positions (slow orbit)
    packages.forEach((p) => {
      p.x = CX + Math.cos(p.angle + frame * 0.002) * p.radius;
      p.y = CY + Math.sin(p.angle + frame * 0.002) * p.radius;
    });

    // Update program positions (counter-orbit)
    programs.forEach((p) => {
      p.x = CX + Math.cos(p.angle - frame * 0.001) * p.radius;
      p.y = CY + Math.sin(p.angle - frame * 0.001) * p.radius;
    });

    // Spawn particles from generator-core to programs
    const gc = packages[3]; // generator-core
    if (frame % 3 === 0) {
      const target = programs[Math.floor(Math.random() * programs.length)];
      const color = target.grade === 'F' ? COLORS.red : target.tier === 'free' ? COLORS.green : COLORS.cyan;
      spawnParticle(gc.x, gc.y, target.x, target.y, color);
    }

    // Spawn particles between packages (data flow)
    if (frame % 8 === 0) {
      const rp = packages[0]; // repo-parser
      const ce = packages[1]; // context-engine
      spawnParticle(rp.x, rp.y, ce.x, ce.y, COLORS.orange);
    }
    if (frame % 8 === 4) {
      const ce = packages[1]; // context-engine
      const gc2 = packages[3]; // generator-core
      spawnParticle(ce.x, ce.y, gc2.x, gc2.y, COLORS.orange);
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += p.speed;
      p.x = lerp(p.x, p.tx, p.speed);
      p.y = lerp(p.y, p.ty, p.speed);
      if (p.t >= 1) {
        particles.splice(i, 1);
      }
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function draw() {
    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // Draw subtle grid
    ctx.strokeStyle = COLORS.border + '40';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Draw edges (faint lines)
    ctx.strokeStyle = COLORS.border + '60';
    ctx.lineWidth = 1;

    // Package → Package connections
    drawEdge(packages[0], packages[1]); // repo-parser → context-engine
    drawEdge(packages[1], packages[3]); // context-engine → generator-core

    // generator-core → programs
    const gc = packages[3];
    programs.forEach((p) => {
      ctx.strokeStyle = (p.grade === 'F' ? COLORS.red : COLORS.cyan) + '20';
      drawEdge(gc, p);
    });

    // Draw particles
    particles.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 1 - p.t;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Draw package nodes
    packages.forEach((p) => {
      drawNode(p.x, p.y, 24, COLORS.orange, p.label, true);
    });

    // Draw program nodes
    programs.forEach((p) => {
      const color = p.grade === 'F' ? COLORS.red : p.tier === 'free' ? COLORS.green : COLORS.cyan;
      const size = 8 + p.generators * 1.5;
      drawNode(p.x, p.y, size, color, p.id, false);
    });

    // Draw center hub
    ctx.beginPath();
    ctx.arc(CX, CY, 30, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.surface;
    ctx.fill();
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AXIS', CX, CY - 6);
    ctx.fillText('80 gen', CX, CY + 6);

    // Stats overlay
    ctx.fillStyle = COLORS.surface + 'CC';
    ctx.fillRect(12, 12, 180, 80);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, 180, 80);
    ctx.fillStyle = COLORS.text;
    ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText("Axis' Iliad Topology", 22, 32);
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '11px system-ui';
    ctx.fillText(`Packages: ${packages.length}  Programs: ${programs.length}`, 22, 50);
    ctx.fillText(`Generators: 80  Grade A: 81/82`, 22, 66);
    ctx.fillText(`Particles: ${particles.length}`, 22, 82);
  }

  function drawEdge(from, to) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function drawNode(x, y, size, color, label, isPackage) {
    // Glow
    ctx.beginPath();
    ctx.arc(x, y, size + 4, 0, Math.PI * 2);
    ctx.fillStyle = color + '20';
    ctx.fill();

    // Node
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.surface;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = isPackage ? 2 : 1.5;
    ctx.stroke();

    // Label
    ctx.fillStyle = isPackage ? COLORS.text : COLORS.textMuted;
    ctx.font = isPackage ? 'bold 10px system-ui' : '9px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isPackage) {
      ctx.fillText(label, x, y);
    } else {
      ctx.fillText(label, x, y + size + 12);
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  loop();
})();
