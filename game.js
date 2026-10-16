/* Tennis Reflex — 原生 JavaScript 小游戏
   无任何依赖，浏览器直接打开 index.html 即可运行。 */
(function () {
  "use strict";

  /* ================= 基础元素 ================= */
  const canvas = document.getElementById("court");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const levelEl = document.getElementById("level");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const overlayBtn = document.getElementById("overlayBtn");

  /* ================= 尺寸 & 配置 ================= */
  const W = 480; // 逻辑宽度
  const H = 640; // 逻辑高度

  // 高分屏清晰度处理
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // 球场范围
  const COURT = { x: 24, y: 26, w: W - 48, h: 578 };

  // 球拍
  const PADDLE_W = 96;
  const PADDLE_H = 14;
  const PADDLE_Y = 566; // 球拍顶边
  const PADDLE_SPEED = 640; // px / 秒
  const PADDLE_INSET = 8; // 球拍与球场边线的距离

  // 网球
  const BALL_R = 10;
  const BASE_SPEED = 220; // Level 1 的下落速度
  const SPEED_PER_LEVEL = 48;
  const MAX_SPEED = 880;

  // 关卡
  const POINTS_PER_LEVEL = 5;
  const MAX_LEVEL = 12;

  // 出球间隔
  const BASE_SPAWN_DELAY = 0.55;
  const MIN_SPAWN_DELAY = 0.18;

  // 生命
  const START_LIVES = 3;

  /* ================= 状态 ================= */
  const state = {
    phase: "ready", // ready | playing | over
    score: 0,
    lives: START_LIVES,
    level: 1,
    paddleX: W / 2 - PADDLE_W / 2,
    paddleV: 0,
    paddleHit: 0, // 击球动画进度 1 -> 0
    ball: null,
    spawnTimer: 0,
    toast: null, // { text, t } 升级提示
    flash: 0 // 漏球时的红色闪烁
  };

  const keys = { left: false, right: false };

  /* ================= 小工具 ================= */
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function paddleMinX() {
    return COURT.x + PADDLE_INSET;
  }

  function paddleMaxX() {
    return COURT.x + COURT.w - PADDLE_INSET - PADDLE_W;
  }

  function speedForLevel(level) {
    return Math.min(MAX_SPEED, BASE_SPEED + (level - 1) * SPEED_PER_LEVEL);
  }

  function spawnDelayForLevel(level) {
    return Math.max(MIN_SPAWN_DELAY, BASE_SPAWN_DELAY - (level - 1) * 0.03);
  }

  function levelForScore(score) {
    return Math.min(MAX_LEVEL, 1 + Math.floor(score / POINTS_PER_LEVEL));
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /* ================= HUD & 浮层 ================= */
  function updateHud() {
    scoreEl.textContent = String(state.score);
    levelEl.textContent = String(state.level);
    livesEl.textContent =
      "♥".repeat(Math.max(0, state.lives)) + "♡".repeat(Math.max(0, START_LIVES - state.lives));
  }

  function showOverlay(title, html, buttonText) {
    overlayTitle.textContent = title;
    overlayText.innerHTML = html;
    overlayBtn.textContent = buttonText;
    overlay.classList.add("is-visible");
  }

  function hideOverlay() {
    overlay.classList.remove("is-visible");
  }

  /* ================= 游戏流程 ================= */
  function resetGame() {
    state.score = 0;
    state.lives = START_LIVES;
    state.level = 1;
    state.paddleV = 0;
    state.paddleHit = 0;
    state.ball = null;
    state.spawnTimer = 0.4;
    state.toast = null;
    state.flash = 0;
    state.paddleX = clamp(W / 2 - PADDLE_W / 2, paddleMinX(), paddleMaxX());
    updateHud();
  }

  function startGame() {
    resetGame();
    state.phase = "playing";
    hideOverlay();
    spawnBall();
  }

  function endGame() {
    state.phase = "over";
    state.ball = null;
    state.flash = 1;
    showOverlay(
      "Game Over",
      "本局得分 <strong>" + state.score + "</strong> · 到达 Level " + state.level,
      "Restart"
    );
  }

  function startOrRestart() {
    if (state.phase === "playing") return;
    startGame();
  }

  function spawnBall() {
    const minX = COURT.x + BALL_R + 12;
    const maxX = COURT.x + COURT.w - BALL_R - 12;
    state.ball = {
      x: minX + Math.random() * (maxX - minX),
      y: COURT.y - BALL_R,
      r: BALL_R,
      vy: speedForLevel(state.level),
      angle: 0
    };
  }

  /* ================= 更新逻辑 ================= */
  function updatePaddle(dt) {
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const targetV = dir * PADDLE_SPEED;

    // 平滑加减速，让球拍移动更有手感
    state.paddleV += (targetV - state.paddleV) * Math.min(1, dt * 16);
    state.paddleX = clamp(state.paddleX + state.paddleV * dt, paddleMinX(), paddleMaxX());

    if (state.paddleX <= paddleMinX() || state.paddleX >= paddleMaxX()) {
      state.paddleV = 0;
    }

    state.paddleHit = Math.max(0, state.paddleHit - dt * 5.5);
  }

  function updateBall(dt) {
    const ball = state.ball;

    if (!ball) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) spawnBall();
      return;
    }

    ball.y += ball.vy * dt;
    ball.angle += dt * (4 + ball.vy / 140); // 旋转动画

    const paddleTop = PADDLE_Y;
    const paddleBottom = PADDLE_Y + PADDLE_H;
    const paddleLeft = state.paddleX;
    const paddleRight = state.paddleX + PADDLE_W;

    const hitPaddle =
      ball.y + ball.r >= paddleTop &&
      ball.y - ball.r <= paddleBottom &&
      ball.x + ball.r * 0.6 >= paddleLeft &&
      ball.x - ball.r * 0.6 <= paddleRight;

    if (hitPaddle) {
      state.score += 1;

      const newLevel = levelForScore(state.score);
      if (newLevel > state.level) {
        state.level = newLevel;
        state.toast = { text: "Level " + state.level, t: 1 };
      }

      state.paddleHit = 1;
      state.ball = null;
      state.spawnTimer = spawnDelayForLevel(state.level);
      updateHud();
      return;
    }

    if (ball.y - ball.r > COURT.y + COURT.h) {
      state.lives -= 1;
      state.ball = null;
      state.spawnTimer = 0.35;
      state.flash = 0.8;
      updateHud();

      if (state.lives <= 0) endGame();
    }
  }

  function update(dt) {
    if (state.phase === "playing") {
      updatePaddle(dt);
      updateBall(dt);
    } else {
      state.paddleHit = Math.max(0, state.paddleHit - dt * 5.5);
    }

    if (state.toast) {
      state.toast.t -= dt * 1.4;
      if (state.toast.t <= 0) state.toast = null;
    }

    state.flash = Math.max(0, state.flash - dt * 2.2);
  }

  /* ================= 绘制 ================= */
  function drawCourt() {
    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1626");
    bg.addColorStop(1, "#060b14");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const x = COURT.x;
    const y = COURT.y;
    const w = COURT.w;
    const h = COURT.h;

    // 球场地面
    const surface = ctx.createLinearGradient(0, y, 0, y + h);
    surface.addColorStop(0, "#134a3d");
    surface.addColorStop(0.5, "#0f3d33");
    surface.addColorStop(1, "#0b3129");

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    roundRect(x, y, w, h, 16);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.restore();

    // 球场线条
    ctx.save();
    roundRect(x, y, w, h, 16);
    ctx.clip();

    const inset = 14;
    const bx = x + inset;
    const by = y + inset;
    const bw = w - inset * 2;
    const bh = h - inset * 2;
    const netY = by + bh / 2;
    const alley = bw * 0.07;
    const service = bh * 0.26;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";

    ctx.strokeRect(bx, by, bw, bh); // 外框

    ctx.beginPath(); // 单打边线
    ctx.moveTo(bx + alley, by);
    ctx.lineTo(bx + alley, by + bh);
    ctx.moveTo(bx + bw - alley, by);
    ctx.lineTo(bx + bw - alley, by + bh);
    ctx.stroke();

    ctx.beginPath(); // 发球线
    ctx.moveTo(bx + alley, netY - service);
    ctx.lineTo(bx + bw - alley, netY - service);
    ctx.moveTo(bx + alley, netY + service);
    ctx.lineTo(bx + bw - alley, netY + service);
    ctx.stroke();

    ctx.beginPath(); // 中线
    ctx.moveTo(bx + bw / 2, netY - service);
    ctx.lineTo(bx + bw / 2, netY + service);
    ctx.stroke();

    // 球网
    ctx.strokeStyle = "rgba(234, 247, 200, 0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(bx - 6, netY);
    ctx.lineTo(bx + bw + 6, netY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  function drawBall(ball) {
    const r = ball.r;

    ctx.save();
    ctx.translate(ball.x, ball.y);

    // 发光
    ctx.shadowColor = "rgba(214, 240, 74, 0.75)";
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
    g.addColorStop(0, "#fbffc9");
    g.addColorStop(0.55, "#dfef4f");
    g.addColorStop(1, "#a8c314");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 旋转的球缝
    ctx.rotate(ball.angle);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-r * 0.95, 0, r * 1.05, -1.05, 1.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r * 0.95, 0, r * 1.05, Math.PI - 1.05, Math.PI + 1.05);
    ctx.stroke();

    ctx.restore();
  }

  function drawPaddle() {
    const squash = state.paddleHit; // 0 -> 1
    const cx = state.paddleX + PADDLE_W / 2;
    const cy = PADDLE_Y + PADDLE_H / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 + squash * 0.14, 1 - squash * 0.45);
    ctx.translate(-PADDLE_W / 2, -PADDLE_H / 2);

    ctx.shadowColor = "rgba(111, 227, 255, " + (0.45 + squash * 0.55).toFixed(3) + ")";
    ctx.shadowBlur = 16 + squash * 22;

    const g = ctx.createLinearGradient(0, 0, 0, PADDLE_H);
    g.addColorStop(0, "#eafcff");
    g.addColorStop(0.5, "#6fe3ff");
    g.addColorStop(1, "#2aa8d8");

    roundRect(0, 0, PADDLE_W, PADDLE_H, PADDLE_H / 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 拍柄
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    roundRect(PADDLE_W / 2 - 5, PADDLE_H - 1, 10, 12, 4);
    ctx.fill();

    ctx.restore();
  }

  function drawToast() {
    const toast = state.toast;
    if (!toast) return;

    ctx.save();
    ctx.globalAlpha = Math.min(1, toast.t);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 34px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(214, 240, 74, 0.95)";
    ctx.shadowColor = "rgba(214, 240, 74, 0.6)";
    ctx.shadowBlur = 18;
    const y = COURT.y + COURT.h * 0.33 - (1 - toast.t) * 30;
    ctx.fillText(toast.text, W / 2, y);
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawCourt();
    if (state.ball) drawBall(state.ball);
    drawPaddle();
    drawToast();

    if (state.flash > 0) {
      ctx.fillStyle = "rgba(255, 92, 92, " + (state.flash * 0.22).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ================= 主循环 ================= */
  let lastTime = 0;

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.05) dt = 0.05; // 防止切后台回来时跳帧

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  /* ================= 输入 ================= */
  window.addEventListener("keydown", function (event) {
    const key = event.key;

    if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      if (key === "ArrowLeft") {
        keys.left = true;
      } else {
        keys.right = true;
      }
      if (state.phase === "ready") startGame();
      return;
    }

    if ((key === " " || key === "Enter") && state.phase !== "playing") {
      if (document.activeElement === overlayBtn) return; // 交给按钮自身的点击
      event.preventDefault();
      startOrRestart();
    }
  });

  window.addEventListener("keyup", function (event) {
    if (event.key === "ArrowLeft") keys.left = false;
    if (event.key === "ArrowRight") keys.right = false;
  });

  window.addEventListener("blur", function () {
    keys.left = false;
    keys.right = false;
  });

  overlayBtn.addEventListener("click", function () {
    startOrRestart();
  });

  /* ================= 启动 ================= */
  resetGame();
  state.phase = "ready";
  requestAnimationFrame(loop);
})();
