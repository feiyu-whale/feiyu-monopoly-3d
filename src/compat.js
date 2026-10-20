// 肥鱼 · 3D 大富翁 —— 兼容层
// 2026-10-18：把 2D 版验证过的星宿逻辑（stars_engine / stars_rank / cn_cards）原样接进 3D 版
// 做法：补上它们需要的全局接口（player / square / popup / addAlert / updateMoney ...），
//       这些接口全部转发到 3D 版自己的状态与界面。老代码一行不改。

/**
 * @param {object} game createGame 返回的实例
 * @param {object} world World 实例
 * @param {object} hooks { log, refreshUI }
 */
export function installCompat(game, world, hooks = {}) {
  const { log = () => {}, refreshUI = () => {}, TILES = [] } = hooks;
  const ctxGame = game, ctxWorld = world, ctxTiles = TILES, ctxRefreshUI = refreshUI;

  // ---------- player[] / square[]：只读代理到 3D 状态 ----------
  // 老代码用 player[1..pcount]、square[0..39]，且从 1 开始索引
  const playerProxy = new Proxy([], {
    get(target, prop) {
      const s = game.state;
      if (prop === 'length') return s.players.length + 1;
      const n = Number(prop);
      if (!Number.isNaN(n) && n >= 1) return s.players[n - 1] || undefined;
      return target[prop];
    },
    set(target, prop, value) {
      const n = Number(prop);
      if (!Number.isNaN(n) && n >= 1) { game.state.players[n - 1] = value; return true; }
      target[prop] = value;
      return true;
    },
  });

  // square：3D 的 TILES 直接当 square 用（字段基本对得上）
  const squareProxy = new Proxy([], {
    get(target, prop) {
      if (prop === 'length') return TILES.length;
      const n = Number(prop);
      if (!Number.isNaN(n)) return TILES[n];
      return target[prop];
    },
    set(target, prop, value) {
      const n = Number(prop);
      if (!Number.isNaN(n)) { TILES[n] = value; return true; }
      target[prop] = value;
      return true;
    },
  });

  // ---------- 全局注入 ----------
  const g = window;
  g.player = playerProxy;
  g.square = squareProxy;
  g.pcount = game.state.players.length;
  // 2026-10-18 修：老代码里 player[turn] 是 1 基（player[1] 是第一个玩家），
  // 而 3D 版 state.turn 是 0 基 → 对外暴露时 +1，对内写回时 -1。
  Object.defineProperty(g, 'turn', {
    get: () => game.state.turn + 1,
    set: (v) => { game.state.turn = Math.max(0, v - 1); },
    configurable: true,
  });

  // 金额格式化（与 2D 版一致：万 / 亿 / 兆 ...）
  g.fmtMoney = (n) => {
    n = Number(n) || 0;
    const neg = n < 0;
    const a = Math.abs(n);
    const units = [
      [1e44, '载'], [1e40, '正'], [1e36, '涧'], [1e32, '沟'], [1e28, '穰'],
      [1e24, '秭'], [1e20, '垓'], [1e16, '京'], [1e12, '兆'], [1e8, '亿'], [1e4, '万'],
    ];
    let out;
    if (a >= 1e48) out = a.toExponential(2).replace('e+', '×10^');
    else {
      let hit = null;
      for (const [v, u] of units) { if (a >= v) { hit = [v, u]; break; } }
      out = hit ? (a / hit[0]).toFixed(2).replace(/\.?0+$/, '') + hit[1] : String(Math.round(a));
    }
    return (neg ? '-' : '') + '$' + out;
  };

  // 现金基数（含金币）
  g.cashBase = (p) => (p ? (p.money || 0) + (p.coins || 0) * 10000 : 0);

  // 播报 → 3D 日志
  g.addAlert = (text) => log(text);

  // 刷新界面
  g.updateMoney = () => refreshUI();
  g.updateOwned = () => refreshUI();
  g.updatePosition = () => {};
  g.move = () => {};
  g.rnd = (n) => Math.floor((window.crypto?.getRandomValues
    ? (crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296)
    : Math.random()) * n);
  g.secureRand = g.rnd;


  // ---------- 赐福 / 奇遇 / 核弹 需要的补充接口 ----------
  g.hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
  g.show = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'block'; };

  // 赐福投票 / 奇遇弹窗需要 #popupwrap 等（已由 ensurePopupDOM 提供）
  // 还需要一个可用的 #alert 播报区（老代码里 addAlert 用 jQuery 选 #alert，这里已改写为 log）

  // 资产封顶 / 核弹 需要的工具
  g.RICE = { locked: false };

  // 回合结束钩子：奇遇、赐福的 onPassStart / onPassCorner
  g.__HOOKS = g.__HOOKS || {};

  // ---------- 弹窗（老代码直接改这几个 DOM） ----------
  ensurePopupDOM();

  /**
   * 弹窗容器：完全照 2D 版那套 id 造，老代码就能直接用
   * popup / popuptext / popupwrap / popupbackground / starbtn / cncardbtn
   */
  function ensurePopupDOM() {
    if (document.getElementById('popupwrap')) return;

    const css = document.createElement('style');
    css.textContent = `
      #popupbackground { position: fixed; inset: 0; background: rgba(0,0,0,.62);
        z-index: 9000; display: none; backdrop-filter: blur(3px); }
      #popupwrap { position: fixed; inset: 0; z-index: 9001; display: none;
        align-items: center; justify-content: center; pointer-events: none; }
      /* 2026-10-18：老代码会把 display 设成 block，这里强制用 flex 居中，show/hide 靠 .show 类 */
      #popupwrap[style*="block"] { display: flex !important; }
      #popup { position: relative; z-index: 9002; pointer-events: auto;
        width: min(88vw, 340px) !important; min-width: 0 !important;
        max-height: 78vh; overflow-y: auto;
        background: linear-gradient(165deg, #1a2c3e, #0e1a28);
        border: 1.5px solid #c9a961; border-radius: 16px;
        box-shadow: 0 16px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(255,215,138,.15);
        color: #e8dcc8; padding: 14px; font-size: 13px; line-height: 1.7; }
      #popup.star-popup { border-color: #ffd86a;
        background: linear-gradient(165deg, #2a2418 0%, #12100c 100%); }
      #popup.star-popup.di { background: linear-gradient(165deg, #2a1414 0%, #120a0a 100%);
        border-color: #8a3434; }
      #popup .star-btn, #starbtn, #cncardbtn {
        display: block; width: 100%; margin-top: 12px; padding: 11px;
        font-size: 14px; font-weight: 800; font-family: inherit; letter-spacing: 3px;
        border-radius: 10px; border: none; cursor: pointer;
        background: linear-gradient(160deg, #c9a961, #8a6f30); color: #1a1410; }
      #popup.di .star-btn { background: linear-gradient(160deg, #a83232, #6e1f1f); color: #f0e6cc; }
      #popuptext { word-break: break-word; }
    `;
    document.head.appendChild(css);

    const bg = document.createElement('div'); bg.id = 'popupbackground';
    bg.style.display = 'none';                 // 2026-10-18：初始必须隐藏，否则全屏吞点击
    bg.style.pointerEvents = 'auto';
    const wrap = document.createElement('div'); wrap.id = 'popupwrap';
    wrap.style.display = 'none';               // 同理，初始隐藏
    const pop = document.createElement('div'); pop.id = 'popup';
    const txt = document.createElement('div'); txt.id = 'popuptext';
    const btn = document.createElement('button'); btn.id = 'starbtn'; btn.textContent = '收下'; btn.style.display = 'none';
    const btn2 = document.createElement('button'); btn2.id = 'cncardbtn'; btn2.textContent = '收下'; btn2.style.display = 'none';

    pop.appendChild(txt); pop.appendChild(btn); pop.appendChild(btn2);
    wrap.appendChild(pop);
    document.body.appendChild(bg);
    document.body.appendChild(wrap);

    btn.addEventListener('click', () => { hidePopup(); if (btn._cb) { const c = btn._cb; btn._cb = null; c(); } });
    btn2.addEventListener('click', () => { hidePopup(); if (btn2._cb) { const c = btn2._cb; btn2._cb = null; c(); } });
    bg.addEventListener('click', hidePopup);
  }

  function hidePopup() {
    const bg = document.getElementById('popupbackground');
    const wrap = document.getElementById('popupwrap');
    // 2026-10-18：用 important 强制隐藏，防止被老代码的样式覆盖后仍挡住点击
    if (bg) { bg.style.setProperty('display', 'none', 'important'); bg.style.pointerEvents = 'none'; }
    if (wrap) { wrap.style.setProperty('display', 'none', 'important'); }
    const b1 = document.getElementById('starbtn'); if (b1) b1.style.display = 'none';
    const b2 = document.getElementById('cncardbtn'); if (b2) b2.style.display = 'none';
  }

  // popup(HTML, action, option) —— 与 2D 版同签名
  g.popup = (HTML, action, option) => {
    ensurePopupDOM();
    document.getElementById('popuptext').innerHTML = HTML;
    const bg = document.getElementById('popupbackground');
    const wrap = document.getElementById('popupwrap');
    bg.style.setProperty('display', 'block', 'important');
    bg.style.pointerEvents = 'auto';
    wrap.style.setProperty('display', 'flex', 'important');

    // option: "yesno" / "close" 等；简化为「确定」
    const btn = document.getElementById('starbtn');
    btn.style.display = 'block';
    btn.textContent = (typeof option === 'string' && option.toLowerCase() === 'yesno') ? '确定' : '关闭';
    btn._cb = typeof action === 'function' ? action : null;
  };
  g.hidePopup = hidePopup;

  // ---------- 加载老逻辑 ----------
  // 这三个文件是 IIFE，执行时挂到 window 上
  return {
    playerProxy, squareProxy,
    async loadLegacy() {
      /* ============================================================
       * 2026-10-20 干净版：旧卡牌体系全部断开，代码文件保留不删
       * ------------------------------------------------------------
       * 已断开（不加载，文件仍在 ./legacy/ 里，想接回来把注释拆掉即可）：
       *   encounter.js   奇遇
       *   boon.js        赐福
       *   stars_engine.js  108 星宿
       *   stars_rank.js  升星 / 核弹 / 绝版
       *   cn_cards.js    武将 / 神明 / 机制卡
       *   cards.js       旧的机会 / 命运卡
       *
       * 新接：oracle.js —— 玄枢机会 / 命运（时间 → SHA-256 → 卦签 → 吉凶）
       * ============================================================ */

      // ---- 旧体系（已断开，保留代码不删）----
      // await import('./legacy/encounter.js');
      // await import('./legacy/boon.js');
      // await import('./legacy/stars_engine.js');
      // await import('./legacy/stars_rank.js');
      // await import('./legacy/cn_cards.js');
      // await import('./legacy/cards.js');

      // ---- 新体系：玄枢机会 / 命运 ----
      try {
        const mod = await import('./legacy/oracle.js');
        if (mod && typeof mod.installOracle === 'function') {
          window.Oracle = mod.installOracle({
            game: ctxGame, world: ctxWorld, TILES: ctxTiles, log, refreshUI: ctxRefreshUI,
          });
          // 兼容旧调用点（game.js 里判的是 window.Cards）
          window.Cards = window.Oracle;
          log('玄枢机会 / 命运 已加载');
        }
      } catch (e) {
        log('⚠️ 玄枢加载失败：' + (e && e.message));
      }
    },
    hidePopup,
  };
}
