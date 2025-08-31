/* Fish Feast - a small arcade growth game
   Controls: WASD / Arrows or drag on touch. Eat smaller fish to grow.
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const livesEl = document.getElementById('lives');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const restartBtn = document.getElementById('restartBtn');
const overlay = document.getElementById('overlay');
const gameOverCard = document.getElementById('gameOver');
const finalScoreEl = document.getElementById('finalScore');

let devicePixelRatioCached = window.devicePixelRatio || 1;
function resizeCanvas() {
  const ratio = devicePixelRatioCached;
  const w = Math.max(320, window.innerWidth);
  const h = Math.max(320, window.innerHeight);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.floor(w * ratio);
  canvas.height = Math.floor(h * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Utility
const TAU = Math.PI * 2;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const rand = (min, max) => Math.random() * (max - min) + min;
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy;
};
function hsl(h, s, l) { return `hsl(${h} ${s}% ${l}%)`; }

// Input
const input = {
  up: false, down: false, left: false, right: false,
  pointerId: null, px: 0, py: 0, dragging: false
};
const keyMap = new Map([
  ['ArrowUp', 'up'], ['KeyW', 'up'],
  ['ArrowDown', 'down'], ['KeyS', 'down'],
  ['ArrowLeft', 'left'], ['KeyA', 'left'],
  ['ArrowRight', 'right'], ['KeyD', 'right']
]);
window.addEventListener('keydown', (e) => {
  const k = keyMap.get(e.code);
  if (k) { input[k] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const k = keyMap.get(e.code);
  if (k) input[k] = false;
});

canvas.addEventListener('pointerdown', (e) => {
  input.pointerId = e.pointerId;
  input.dragging = true;
  input.px = e.clientX; input.py = e.clientY;
});
canvas.addEventListener('pointerup', () => { input.dragging = false; input.pointerId = null; });
canvas.addEventListener('pointercancel', () => { input.dragging = false; input.pointerId = null; });
canvas.addEventListener('pointermove', (e) => {
  if (input.dragging && e.pointerId === input.pointerId) {
    const dx = e.clientX - input.px;
    const dy = e.clientY - input.py;
    input.left = dx < -6;
    input.right = dx > 6;
    input.up = dy < -6;
    input.down = dy > 6;
    input.px = e.clientX; input.py = e.clientY;
  }
});

// Game state
const state = {
  running: false,
  paused: false,
  score: 0,
  best: Number(localStorage.getItem('fish-best') || 0),
  lives: 3,
  time: 0,
  currentWave: 0
};
bestEl.textContent = String(state.best);

// Entities
class Fish {
  constructor(x, y, radius, isPlayer = false) {
    this.x = x; this.y = y; this.radius = radius;
    this.vx = rand(-30, 30); this.vy = rand(-30, 30);
    this.isPlayer = isPlayer;
    this.hue = isPlayer ? 160 : rand(180, 230);
    this.sat = isPlayer ? 80 : rand(50, 70);
    this.light = isPlayer ? 60 : rand(45, 65);
    this.mouthOpen = 0;
  }
  get size() { return Math.PI * this.radius * this.radius; }
}

/** World holds and updates all entities. */
class World {
  constructor() {
    this.player = new Fish(canvas.width * 0.5, canvas.height * 0.5, 18, true);
    this.enemies = [];
    this.food = [];
    this.currentSpeed = { x: 0, y: 0 };
    this.spawnInitial();
  }
  spawnInitial() {
    this.enemies.length = 0; this.food.length = 0;
    for (let i = 0; i < 16; i++) this.spawnEnemy();
    for (let i = 0; i < 22; i++) this.spawnFood();
  }
  spawnEnemy() {
    const margin = 40; // keep off-screen spawn
    const x = Math.random() < 0.5 ? -margin : canvas.width + margin;
    const y = rand(0, canvas.height);
    const r = rand(10, 42) + state.currentWave * 0.6;
    const f = new Fish(x, y, r, false);
    const targetX = rand(canvas.width * 0.2, canvas.width * 0.8);
    const speed = rand(20, 60) + r * 0.6;
    const dirX = targetX - x; const dirY = rand(-100, 100);
    const len = Math.hypot(dirX, dirY) || 1;
    f.vx = (dirX / len) * speed; f.vy = (dirY / len) * speed * 0.5;
    this.enemies.push(f);
  }
  spawnFood() {
    const x = rand(30, canvas.width - 30);
    const y = rand(30, canvas.height - 30);
    const r = rand(4, 10);
    const f = new Fish(x, y, r, false);
    f.hue = rand(15, 55); f.sat = 90; f.light = 60;
    f.vx = rand(-15, 15); f.vy = rand(-15, 15);
    this.food.push(f);
  }
}

let world = new World();

function resetGame() {
  state.score = 0;
  state.lives = 3;
  state.time = 0;
  state.currentWave = 0;
  world = new World();
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = String(state.score);
  bestEl.textContent = String(state.best);
  livesEl.textContent = String(state.lives);
}

function updateCurrent(dt) {
  const t = state.time * 0.001;
  const cx = Math.sin(t * 0.6) * 20 + Math.sin(t * 1.7) * 10;
  const cy = Math.cos(t * 0.9) * 16 + Math.sin(t * 1.1) * 8;
  world.currentSpeed.x = cx;
  world.currentSpeed.y = cy;
}

function handlePlayerInput(player, dt) {
  const accel = 260;
  const drag = 0.9;
  if (input.up) player.vy -= accel * dt;
  if (input.down) player.vy += accel * dt;
  if (input.left) player.vx -= accel * dt;
  if (input.right) player.vx += accel * dt;
  player.vx *= drag; player.vy *= drag;
}

function keepInBounds(fish) {
  const margin = fish.radius + 2;
  if (fish.x < margin) { fish.x = margin; fish.vx = Math.abs(fish.vx) * 0.7; }
  if (fish.x > canvas.width - margin) { fish.x = canvas.width - margin; fish.vx = -Math.abs(fish.vx) * 0.7; }
  if (fish.y < margin) { fish.y = margin; fish.vy = Math.abs(fish.vy) * 0.7; }
  if (fish.y > canvas.height - margin) { fish.y = canvas.height - margin; fish.vy = -Math.abs(fish.vy) * 0.7; }
}

function updateWorld(dt) {
  state.time += dt * 1000;
  updateCurrent(dt);

  const player = world.player;
  handlePlayerInput(player, dt);
  player.vx += world.currentSpeed.x * 0.2 * dt;
  player.vy += world.currentSpeed.y * 0.2 * dt;
  player.x += player.vx * dt; player.y += player.vy * dt;
  keepInBounds(player);

  // Update enemies
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    e.vx += world.currentSpeed.x * 0.1 * dt;
    e.vy += world.currentSpeed.y * 0.1 * dt;
    e.x += e.vx * dt; e.y += e.vy * dt;
    // Cull off-screen
    if (e.x < -80 || e.x > canvas.width + 80 || e.y < -80 || e.y > canvas.height + 80) {
      world.enemies.splice(i, 1);
      continue;
    }
    // Interactions with player
    const rSum = e.radius + player.radius * 0.9;
    if (dist2(e.x, e.y, player.x, player.y) < rSum * rSum) {
      if (e.radius < player.radius * 0.9) {
        // Eat enemy smaller
        const gained = Math.min(e.radius * 0.6, 8);
        player.radius = Math.min(player.radius + gained * 0.25, 80);
        state.score += Math.round(10 + e.radius);
        world.enemies.splice(i, 1);
        player.mouthOpen = 1;
      } else {
        // Hit bigger enemy: lose a life and shrink
        state.lives -= 1;
        player.radius = Math.max(12, player.radius * 0.8);
        player.vx = -Math.sign(e.vx) * 200; player.vy = -Math.sign(e.vy) * 200;
        world.enemies.splice(i, 1);
        if (state.lives <= 0) {
          endGame();
          return;
        }
      }
    }
  }

  // Update food
  for (let i = world.food.length - 1; i >= 0; i--) {
    const f = world.food[i];
    f.vx += world.currentSpeed.x * 0.05 * dt;
    f.vy += world.currentSpeed.y * 0.05 * dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    keepInBounds(f);
    const rSum = f.radius + player.radius * 0.8;
    if (dist2(f.x, f.y, player.x, player.y) < rSum * rSum) {
      player.radius = Math.min(player.radius + f.radius * 0.15, 90);
      state.score += Math.max(1, Math.round(f.radius));
      world.food.splice(i, 1);
      player.mouthOpen = 1;
    }
  }

  // Spawn pacing
  if (world.enemies.length < 16) world.spawnEnemy();
  if (world.food.length < 20) world.spawnFood();

  // Difficulty pacing
  const wave = Math.floor(state.time / 8000);
  if (wave !== state.currentWave) {
    state.currentWave = wave;
    for (let i = 0; i < 3; i++) world.spawnEnemy();
  }

  if (state.score > state.best) {
    state.best = state.score;
  }
  updateHUD();
}

function drawBackground() {
  // Soft vertical gradient water
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#07314d');
  g.addColorStop(1, '#04192a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Caustics like waves
  const t = state.time * 0.001;
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#9be3ff';
  for (let i = 0; i < 3; i++) {
    const y = (Math.sin(t * (0.6 + i * 0.1)) * 0.5 + 0.5) * canvas.height;
    ctx.beginPath();
    ctx.ellipse(canvas.width * 0.5, y, canvas.width * 0.6, 60 + i * 20, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawFish(fish) {
  const dir = Math.atan2(fish.vy, fish.vx);
  const mouth = fish.mouthOpen;
  fish.mouthOpen = Math.max(0, mouth - 0.1);
  const bodyLen = fish.radius * 2.2;

  ctx.save();
  ctx.translate(fish.x, fish.y);
  ctx.rotate(dir);

  // Body
  const gradient = ctx.createLinearGradient(-fish.radius, 0, bodyLen, 0);
  gradient.addColorStop(0, hsl(fish.hue, fish.sat, fish.light + 8));
  gradient.addColorStop(1, hsl(fish.hue, fish.sat, fish.light - 10));
  ctx.fillStyle = gradient;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';

  ctx.beginPath();
  ctx.ellipse(0, 0, bodyLen, fish.radius * 1.2, 0, 0, TAU);
  ctx.fill();

  // Tail
  ctx.beginPath();
  ctx.moveTo(-bodyLen, 0);
  ctx.quadraticCurveTo(-bodyLen - fish.radius * 0.8, -fish.radius * 0.6, -bodyLen - fish.radius * 1.2, 0);
  ctx.quadraticCurveTo(-bodyLen - fish.radius * 0.8, fish.radius * 0.6, -bodyLen, 0);
  ctx.fillStyle = hsl(fish.hue, fish.sat, fish.light + 5);
  ctx.fill();

  // Eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(fish.radius * 0.6, -fish.radius * 0.3, Math.max(3, fish.radius * 0.18), 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#0b1520';
  ctx.beginPath();
  ctx.arc(fish.radius * 0.8, -fish.radius * 0.3, Math.max(2, fish.radius * 0.1), 0, TAU);
  ctx.fill();

  // Mouth
  ctx.strokeStyle = '#06111a';
  ctx.lineWidth = Math.max(1, fish.radius * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const open = mouth * fish.radius * 0.4;
  ctx.moveTo(fish.radius * 1.2, 0);
  ctx.lineTo(fish.radius * 1.2 + open, 0);
  ctx.stroke();

  ctx.restore();
}

function draw() {
  drawBackground();

  // Current arrows
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.translate(canvas.width - 80, 40);
  ctx.rotate(Math.atan2(world.currentSpeed.y, world.currentSpeed.x));
  ctx.fillStyle = '#a7f3d0';
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(40, 0); ctx.lineTo(0, 8); ctx.closePath();
  ctx.fill();
  ctx.restore();

  for (const f of world.food) drawFish(f);
  for (const e of world.enemies) drawFish(e);
  drawFish(world.player);
}

let lastTime = 0;
function loop(ts) {
  if (!state.running) return;
  if (state.paused) { requestAnimationFrame(loop); return; }
  if (!lastTime) lastTime = ts;
  const dt = clamp((ts - lastTime) / 1000, 0, 0.033);
  lastTime = ts;
  updateWorld(dt);
  draw();
  requestAnimationFrame(loop);
}

function startGame() {
  overlay.classList.add('hidden');
  gameOverCard.classList.remove('show');
  state.running = true; state.paused = false; lastTime = 0;
  requestAnimationFrame(loop);
}

function endGame() {
  state.running = false; state.paused = false;
  finalScoreEl.textContent = `Score: ${state.score}\nBest: ${state.best}`;
  localStorage.setItem('fish-best', String(state.best));
  gameOverCard.classList.add('show');
}

startBtn.addEventListener('click', () => {
  resetGame();
  startGame();
});

restartBtn.addEventListener('click', () => {
  gameOverCard.classList.remove('show');
  resetGame();
  startGame();
});

pauseBtn.addEventListener('click', () => {
  if (!state.running) return;
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? '▶' : '⏸';
});

// Decorative bubbles
function spawnBubbles() {
  for (let i = 0; i < 20; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    const left = Math.random() * 100;
    const size = rand(3, 8);
    b.style.left = left + 'vw';
    b.style.width = size + 'px'; b.style.height = size + 'px';
    b.style.animationDuration = (rand(6, 16)) + 's';
    b.style.animationDelay = (rand(0, 8)) + 's';
    document.body.appendChild(b);
  }
}
spawnBubbles();

