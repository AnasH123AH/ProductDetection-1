/**
 * VisionaryAI - Enterprise Computer Vision Simulation Canvas
 * Renders real-time AI neural graph, floating object detection bounding boxes,
 * laser scan pulses, and authentic live telemetry counters.
 */

(function () {
  'use strict';

  const canvas = document.getElementById('aiVisionCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let animationFrameId;
  let width, height;

  // Particle Nodes for Neural Grid
  const nodes = [];
  const totalNodes = 36;
  const maxDistance = 140;

  // Dynamic Bounding Boxes
  const boundingBoxes = [
    { x: 0.15, y: 0.25, w: 120, h: 80, label: 'SKU-7729 [BEARING]', conf: '99.9%', color: '#38BDF8', dx: 0.2, dy: 0.15 },
    { x: 0.55, y: 0.65, w: 140, h: 95, label: 'PALLET-A4 [SEALED]', conf: '99.7%', color: '#10B981', dx: -0.15, dy: 0.2 },
    { x: 0.65, y: 0.20, w: 110, h: 70, label: 'LABEL-QR2D', conf: '100%', color: '#38BDF8', dx: 0.1, dy: -0.18 },
    { x: 0.20, y: 0.75, w: 130, h: 85, label: 'DEFECT-CHECK: PASS', conf: '99.8%', color: '#06B6D4', dx: -0.2, dy: -0.12 }
  ];

  // Mouse Parallax Interaction
  let mouse = { x: -1000, y: -1000, targetX: 0, targetY: 0 };

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;

    if (width === 0 || height === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    initNodes();
  }

  function initNodes() {
    nodes.length = 0;
    for (let i = 0; i < totalNodes; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: Math.random() * 1.75 + 1,
        alpha: Math.random() * 0.5 + 0.2
      });
    }
  }

  // Draw Subtle Neural Web Connections
  function drawNeuralGrid() {
    for (let i = 0; i < nodes.length; i++) {
      const n1 = nodes[i];
      n1.x += n1.vx;
      n1.y += n1.vy;

      if (n1.x < 0 || n1.x > width) n1.vx *= -1;
      if (n1.y < 0 || n1.y > height) n1.vy *= -1;

      // Draw Node
      ctx.beginPath();
      ctx.arc(n1.x, n1.y, n1.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56, 189, 248, ${n1.alpha * 0.6})`;
      ctx.fill();

      // Connect Near Nodes
      for (let j = i + 1; j < nodes.length; j++) {
        const n2 = nodes[j];
        const dist = Math.hypot(n1.x - n2.x, n1.y - n2.y);

        if (dist < maxDistance) {
          const alpha = (1 - dist / maxDistance) * 0.12;
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
          ctx.lineWidth = 0.85;
          ctx.stroke();
        }
      }
    }
  }

  // Draw AI Bounding Boxes with Corner Target Reticles & Confidence
  function drawBoundingBoxes(time) {
    boundingBoxes.forEach((box) => {
      // Calculate animated position
      let posX = (box.x * width) + Math.sin(time * 0.001 + box.w) * 12;
      let posY = (box.y * height) + Math.cos(time * 0.0012 + box.h) * 10;

      const w = box.w;
      const h = box.h;

      // Box Background fill
      ctx.fillStyle = 'rgba(2, 132, 199, 0.03)';
      ctx.fillRect(posX, posY, w, h);

      // Dashed Outline
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = box.color === '#10B981' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(posX, posY, w, h);
      ctx.setLineDash([]);

      // Corner Reticles
      const cornerLen = 8;
      ctx.strokeStyle = box.color;
      ctx.lineWidth = 1.5;

      // Top Left
      ctx.beginPath();
      ctx.moveTo(posX, posY + cornerLen);
      ctx.lineTo(posX, posY);
      ctx.lineTo(posX + cornerLen, posY);
      ctx.stroke();

      // Top Right
      ctx.beginPath();
      ctx.moveTo(posX + w - cornerLen, posY);
      ctx.lineTo(posX + w, posY);
      ctx.lineTo(posX + w, posY + cornerLen);
      ctx.stroke();

      // Bottom Left
      ctx.beginPath();
      ctx.moveTo(posX, posY + h - cornerLen);
      ctx.lineTo(posX, posY + h);
      ctx.lineTo(posX + cornerLen, posY + h);
      ctx.stroke();

      // Bottom Right
      ctx.beginPath();
      ctx.moveTo(posX + w - cornerLen, posY + h);
      ctx.lineTo(posX + w, posY + h);
      ctx.lineTo(posX + w, posY + h - cornerLen);
      ctx.stroke();

      // Label Header Tag
      ctx.fillStyle = box.color === '#10B981' ? '#059669' : '#0284C7';
      const tagHeight = 16;
      const tagWidth = 118;
      ctx.fillRect(posX, posY - tagHeight, tagWidth, tagHeight);

      // Label Text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`${box.label} [${box.conf}]`, posX + 4, posY - 4);
    });
  }

  // Animation Loop
  function render(time) {
    ctx.clearRect(0, 0, width, height);

    drawNeuralGrid();
    drawBoundingBoxes(time);

    animationFrameId = requestAnimationFrame(render);
  }

  // Live Telemetry Jitter Simulator
  function initTelemetryJitter() {
    const fpsElem = document.getElementById('fpsCounter');
    const latElem = document.getElementById('latencyCounter');

    if (!fpsElem || !latElem) return;

    setInterval(() => {
      const baseFps = 119.5;
      const jitterFps = (baseFps + (Math.random() * 0.9 - 0.4)).toFixed(1);
      fpsElem.textContent = jitterFps;

      const baseLat = 3.8;
      const jitterLat = (baseLat + (Math.random() * 0.5 - 0.2)).toFixed(1);
      latElem.textContent = `${jitterLat}ms`;
    }, 1800);
  }

  // Window Listeners
  window.addEventListener('resize', resizeCanvas);
  
  // Interactive HUD card parallax effect
  const hudCard = document.getElementById('interactiveHudCard');
  if (hudCard) {
    document.addEventListener('mousemove', (e) => {
      const { innerWidth, innerHeight } = window;
      if (innerWidth <= 960) return;
      
      const xPercent = (e.clientX / innerWidth - 0.5) * 8;
      const yPercent = (e.clientY / innerHeight - 0.5) * 8;
      
      hudCard.style.transform = `perspective(800px) rotateY(${xPercent * 0.4}deg) rotateX(${-yPercent * 0.4}deg) translateY(-2px)`;
    });
  }

  // Start
  resizeCanvas();
  animationFrameId = requestAnimationFrame(render);
  initTelemetryJitter();
})();
