// 肥鱼 · 3D 大富翁 —— 转场特效层
// 2026-10-18 v0.5：3D 棋盘从天而降「压碎」2D 棋盘
// 纯 canvas 实现，零依赖

/**
 * 2D 棋盘被「自上而下压碎」：碎片从冲击中心向外抛飞、翻落
 * @param {HTMLCanvasElement} snap 2D 棋盘快照
 * @param {object} opt
 */
export function crushBoard(snap, opt = {}) {
  const {
    cell = 15,
    duration = 1900,
    upBias = 0.9,      // 碎片往上抛的力度
    outPower = 9.5,    // 向外扩散力度
  } = opt;

  const W = snap.width;
  const H = snap.height;
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);

  let srcCtx = null;
  try { srcCtx = snap.getContext('2d'); } catch (e) { srcCtx = null; }

  const fx = document.createElement('canvas');
  fx.width = W; fx.height = H;
  fx.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:900;';
  document.body.appendChild(fx);
  const ctx = fx.getContext('2d');

  const CX = W / 2, CY = H / 2;
  const parts = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cell, py = y * cell;
      let color = '#f2e8d5';
      if (srcCtx) {
        try {
          const w = Math.min(cell, W - px), h = Math.min(cell, H - py);
          const d = srcCtx.getImageData(px, py, w, h).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 8) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
          }
          if (n) color = `rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})`;
        } catch (e) { /* ignore */ }
      }

      // 距中心越远，被推得越开的力度越大（冲击波）
      const dx = (px + cell / 2 - CX);
      const dy = (py + cell / 2 - CY);
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      const power = Math.min(1.6, dist / (W * 0.42)) * outPower;

      parts.push({
        x: px, y: py, size: cell, color,
        vx: nx * power + (Math.random() - 0.5) * 2.2,
        vy: ny * power * 0.55 - upBias * (1 + Math.random() * 1.9),
        z: 1,                 // 伪深度：越大飞得越高
        vz: 6 + Math.random() * 9,
        rot: 0,
        vr: (Math.random() - 0.5) * 0.42,
        delay: (dist / (Math.hypot(W, H) / 2)) * 190,   // 冲击波从中心向外传
        alpha: 1,
      });
    }
  }

  const t0 = performance.now();
  return new Promise((resolve) => {
    function frame(now) {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      let alive = 0;

      for (const p of parts) {
        const lt = t - p.delay;
        if (lt < 0) { alive++; continue; }
        const k = lt / duration;
        if (k >= 1) continue;
        alive++;

        // 抛物线：先被上抛，再落下
        p.vz -= 26 * 0.016;
        p.z += p.vz * 0.016;
        if (p.z < 0) { p.z = 0; p.vz *= -0.28; }

        p.x += p.vx * 0.62;
        p.y += p.vy * 0.62;
        p.vx *= 0.988;
        p.vy *= 0.988;
        p.rot += p.vr;
        p.alpha = Math.max(0, 1 - k * 1.05);

        const s = p.size * (1 - k * 0.22);
        const climb = Math.max(0, p.z) * 0.9;   // 视觉上抬高

        ctx.save();
        ctx.translate(p.x + p.size / 2, p.y + p.size / 2 - climb);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;
        // 侧面色，做一点立体
        ctx.fillStyle = p.color;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.globalAlpha = p.alpha * 0.35;
        ctx.fillStyle = '#1c2e40';
        ctx.fillRect(-s / 2, s / 2 - 2, s, 2.5);
        ctx.restore();
      }

      if (alive > 0 && t < duration + 1200) requestAnimationFrame(frame);
      else { fx.remove(); resolve(); }
    }
    requestAnimationFrame(frame);
  });
}

/**
 * 3D 棋盘从天上砸下来
 * @param {object} world World 实例
 */
export function slamDown(world, opt = {}) {
  const { height = 42, duration = 780, shake = true } = opt;
  return new Promise((resolve) => {
    const group = world?.boardGroup;
    if (!group) { resolve(); return; }

    const originY = group.position.y;
    const t0 = performance.now();
    group.position.y = originY + height;
    group.rotation.x = -0.3;

    function frame(now) {
      const k = Math.min(1, (now - t0) / duration);
      const ease = k * k * k;               // 砸下来：加速下落
      group.position.y = originY + height * (1 - ease);
      group.rotation.x = -0.3 * (1 - ease);

      if (k < 1) {
        requestAnimationFrame(frame);
      } else {
        group.position.y = originY;
        group.rotation.x = 0;
        // 落地震屏
        if (shake) {
          const wrap = document.getElementById('boardshake');
          if (wrap) {
            wrap.style.animation = 'none';
            void wrap.offsetWidth;
            wrap.style.animation = 'shake .42s ease-out';
          }
          document.body.style.animation = 'none';
          void document.body.offsetWidth;
          document.body.style.animation = 'shakeBody .42s ease-out';
        }
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

/** 落地冲击光波 + 灰尘 */
export function impactBurst(opt = {}) {
  const { duration = 700 } = opt;
  const fx = document.createElement('canvas');
  const W = (fx.width = window.innerWidth * 2);
  const H = (fx.height = window.innerHeight * 2);
  fx.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:950;';
  document.body.appendChild(fx);
  const ctx = fx.getContext('2d');

  // 灰尘粒子
  const dust = [];
  for (let i = 0; i < 130; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 3 + Math.random() * 11;
    dust.push({
      x: W / 2, y: H / 2,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.62,
      r: 3 + Math.random() * 14, a: 0.28 + Math.random() * 0.4,
    });
  }

  const t0 = performance.now();
  return new Promise((resolve) => {
    function frame(now) {
      const k = Math.min(1, (now - t0) / duration);
      ctx.clearRect(0, 0, W, H);

      // 光波（2026-10-18 修：k=0 时半径会算成 0 以下 → createRadialGradient 报错）
      const r = Math.max(1, k * Math.max(W, H) * 0.78);
      const r0 = Math.max(0, Math.min(r - 0.5, r * 0.25));
      const g = ctx.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r);
      g.addColorStop(0, 'rgba(255,248,225,0)');
      g.addColorStop(0.7, `rgba(255,238,200,${(1 - k) * 0.42})`);
      g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // 灰尘
      for (const d of dust) {
        d.x += d.vx; d.y += d.vy;
        d.vx *= 0.965; d.vy *= 0.965;
        ctx.globalAlpha = d.a * (1 - k);
        ctx.fillStyle = '#c9b48a';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * (1 + k * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (k < 1) requestAnimationFrame(frame);
      else { fx.remove(); resolve(); }
    }
    requestAnimationFrame(frame);
  });
}
