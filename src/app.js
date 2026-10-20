// 肥鱼 · 3D 大富翁 应用入口
// 作用：把 World（3D 渲染层）和游戏逻辑（game.js）接起来
// 2026-10-18 v0.3：点格子 → 买地 → 盖房 → 掷骰子

import { World, preloadTextures, preloadLandmarks, PLAYER_COLORS_CSS } from './three/world.js';
import { TILES, INDUSTRIES } from './data/tiles.js';
import { createGame } from './game.js';
import { crushBoard, slamDown, impactBurst } from './transition.js';
import { installCompat } from './compat.js';
import { PERSONAS } from './ai.js';
import { createCheatGuard } from './cheatguard.js';

export function createApp() {
  const canvas = document.getElementById('scene');
  const hint = document.getElementById('hint');
  const ui = document.getElementById('ui');
  const logEl = document.getElementById('log');
  const infoEl = document.getElementById('tileinfo');
  const playersEl = document.getElementById('players');
  const diceEl = document.getElementById('diceresult');

  let world = null;
  let game = null;
  const appState = { ready: false, lastPick: -1, selected: -1 };



  // ---------- 诊断面板：手机上排查卡在哪 ----
  function diag(msg) {
    const el = document.getElementById('diag');
    if (!el) return;
    el.innerHTML += (el.innerHTML ? '<br>' : '') + msg;
    console.log('[diag]', msg);
  }
  function runDiag() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      diag('WebGL: ' + (gl ? '✅ 支持' : '❌ 不支持'));
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) diag('GPU: ' + gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
        diag('最大纹理: ' + gl.getParameter(gl.MAX_TEXTURE_SIZE));
      }
      diag('分辨率: ' + innerWidth + '×' + innerHeight + ' @' + (devicePixelRatio || 1) + 'x');
      if (performance.memory) {
        const mb = (n) => Math.round(n / 1048576) + 'MB';
        diag('内存: 已用 ' + mb(performance.memory.usedJSHeapSize) + ' / 上限 ' + mb(performance.memory.jsHeapSizeLimit));
      }
      diag('设备内存: ' + (navigator.deviceMemory || '?') + 'GB · 核心: ' + (navigator.hardwareConcurrency || '?'));
    } catch (e) {
      diag('诊断出错: ' + e.message);
    }
  }



  // ---------- 金额格式化 ----------
  function fmtMoney(n) {
    n = Number(n) || 0;
    const neg = n < 0;
    const a = Math.abs(n);
    let out;
    if (a >= 1e12) out = (a / 1e12).toFixed(2).replace(/\.?0+$/, '') + '兆';
    else if (a >= 1e8) out = (a / 1e8).toFixed(2).replace(/\.?0+$/, '') + '亿';
    else if (a >= 1e4) out = (a / 1e4).toFixed(2).replace(/\.?0+$/, '') + '万';
    else out = String(Math.round(a));
    return (neg ? '-' : '') + '¥' + out;
  }

  // ---------- 反作弊：检查与提示 ----------
  let _guardRef = null;
  function checkCheat(allowGain) {
    if (!_guardRef) return;
    try { _guardRef.check({ allowGain }); } catch (e) { console.warn('[guard]', e); }
  }

  /**
   * 抓到异常时的提示：严肃取证 + 玩梗
   * @param {object} res { evidence: string[], count: number }
   * @param {boolean} repeat 是否第二次及以后
   */
  function showCheatPopup(res, repeat) {
    const lines = res.evidence.map((x) => `<div style="padding:3px 0;color:#ffc9a8">· ${x}</div>`).join('');

    const quips = [
      '财神爷路过，看了一眼，什么也没说。',
      '土地公挠了挠头：「这数儿……是不是有点快？」',
      '账房先生翻了三遍账本，最后默默合上了。',
      '月老表示：红线我牵得动，这数额我牵不动。',
    ];
    const quip = quips[Math.min(res.count - 1, quips.length - 1)];

    const html = `
      <div style="padding:18px 14px 12px">
        <div style="text-align:center;font-size:34px;margin-bottom:8px">🕵️</div>
        <div style="text-align:center;font-size:18px;font-weight:900;color:#ffd86a;letter-spacing:3px;margin-bottom:14px">检测到数值异常</div>
        <div style="background:rgba(0,0,0,.25);border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;line-height:1.7">
          <div style="color:#7fa8c8;font-size:11px;letter-spacing:2px;margin-bottom:6px">证 据</div>
          ${lines}
          <div style="padding-top:6px;color:#ff8a8a;font-weight:700">判定：手动修改</div>
        </div>
        <div style="text-align:center;font-size:13px;color:#e8dcc8;line-height:1.8;margin-bottom:12px">
          ${quip}
        </div>
        <div style="text-align:center;font-size:12px;color:#9a8f78;line-height:1.7;padding:10px;background:rgba(255,207,77,.07);border-radius:9px">
          本局已标记为「<b style="color:#ffd86a">天机已泄</b>」模式<br>
          <span style="color:#c9a961">牌局继续，但胜负不记</span><br>
          <span style="font-size:11px;color:#7a6a52">（我们允许你继续玩，只是想让你知道：我们看见了）</span>
        </div>
        ${res.count >= 3 ? `<div style="text-align:center;font-size:11.5px;color:#ff9a4a;margin-top:10px">改得挺认真，要不……来帮我们写代码？</div>` : ''}
      </div>`;
    window.popup(html, null, 'close');
  }

  // ---------- 开局设置页 ----------
  let _seats = [
    { isAI: false },
    { isAI: true, persona: 'shenyi' },
    { isAI: true, persona: 'ahao' },
    { isAI: true, persona: 'linda' },
  ];
  let _count = 4;

  // 2026-10-18 修：设置页必须在主线程空出来之后再渲染，
  //   否则它会在建场景的分帧循环里被阻塞，DOM 一直渲染不出来（座位数 0）。
  function waitForSetup() {
    // 先让出主线程一帧，确保设置页的 DOM 能真正绘制
    return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))).then(() => new Promise((resolve) => {
      const wrap = document.getElementById('setup');
      const seatsEl = document.getElementById('seSeats');
      const countEl = document.getElementById('seCount');
      if (!wrap || !seatsEl) { resolve(_seats.slice(0, _count)); return; }

      const render = () => {
        countEl.textContent = _count;
        seatsEl.innerHTML = '';
        for (let i = 0; i < _count; i++) {
          if (!_seats[i]) _seats[i] = { isAI: i > 0 };
          const row = document.createElement('div');
          row.className = 'se-seat';
          const dot = document.createElement('i');
          dot.style.background = PLAYER_COLORS_CSS[i % PLAYER_COLORS_CSS.length];
          const nm = document.createElement('span');
          nm.className = 'nm';
          nm.textContent = '玩家 ' + (i + 1);
          const sel = document.createElement('select');
          sel.innerHTML = '<option value="human">真人</option>' +
            PERSONAS.map((p) => `<option value="${p.id}">电脑·${p.name}（${p.style}）</option>`).join('');
          sel.value = _seats[i].isAI ? (_seats[i].persona || PERSONAS[i % PERSONAS.length].id) : 'human';
          sel.addEventListener('change', () => {
            const v = sel.value;
            if (v === 'human') _seats[i] = { isAI: false };
            else _seats[i] = { isAI: true, persona: v };
          });
          row.appendChild(dot); row.appendChild(nm); row.appendChild(sel);
          seatsEl.appendChild(row);
        }
        // 2026-10-18：强制一次布局，确保座位真的进了 DOM（否则外部读到的是 0）
        void seatsEl.offsetHeight;
      };

      document.getElementById('seMinus').onclick = () => { _count = Math.max(2, _count - 1); render(); };
      document.getElementById('sePlus').onclick = () => { _count = Math.min(8, _count + 1); render(); };
      document.getElementById('seStart').onclick = () => {
        // 2026-10-18：防空点——座位没渲染好就再渲染一次
        if (!seatsEl.children.length) render();
        const picked = _seats.slice(0, _count).map((x) => ({ ...x }));
        wrap.classList.add('hidden');
        console.log('[setup] 开始游戏，座位', JSON.stringify(picked));
        resolve(picked);
      };
      wrap.classList.remove('hidden');
      hint.textContent = '选好人数和电脑，点开始';
      // 先抛出主线程，等浏览器把设置页画出来再填座位
      setTimeout(() => {
        render();
        console.log('[setup] 座位已渲染', _count, '→ DOM 子节点', seatsEl.children.length);
      }, 50);
    }));
  }

  // ---------- AI 回合 ----------
  async function runAITurn() {
    const s = game.state;
    const p = s.players[s.turn];
    if (!p || !p.isAI) return false;

    hint.textContent = `🤖 ${p.name} 思考中…`;
    await new Promise((r) => setTimeout(r, 550));

    // 掷骰
    let r = await game.roll();
    // 2026-10-20：roll 被拒（上一掷骰未释放）→ 最多重试 4 次，仍失败才跳过
    for (let attempt = 0; !r && attempt < 4; attempt++) {
      await new Promise((x) => setTimeout(x, 350));
      r = await game.roll();
    }
    if (!r) {
      console.warn('[AI] roll 重试 4 次仍被拒，跳过', p.name);
      await new Promise((x) => setTimeout(x, 300));
      game.endTurn();
      return false;
    }
    let aiExtra = 0;
    while (r && r.extraRoll > 0 && aiExtra < 5) {
      aiExtra++;
      await new Promise((x) => setTimeout(x, 450));
      r = await game.roll();
      if (r) {
        appState.selected = r.to;
        renderTileInfo();
        game.payRent(r.to, r.dice[0] + r.dice[1]);
      }
    }
    if (r) {
      appState.selected = r.to;
      renderTileInfo();
      game.payRent(r.to, r.dice[0] + r.dice[1]);
      await new Promise((x) => setTimeout(x, 380));

      // 买地
      const plan = game.aiPlan(p);
      for (const act of plan) {
        if (act.type === 'buy') {
          const br = game.buy(act.tile);
          // 2026-10-20：AI 凑齐同色组 → 也必抽大吉
          if (br && br.ok && br.setBonus && window.Oracle && window.Oracle.trigger) {
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, 8000);
              window.Oracle.trigger('fate', p, () => { clearTimeout(timer); resolve(); }, { forceLevel: 'daji' });
            });
          }
          await new Promise((x) => setTimeout(x, 300));
        }
        if (act.type === 'build') { game.build(act.tile); await new Promise((x) => setTimeout(x, 300)); }
      }
      // 钱够就再升一次
      if (p.money > 6000) {
        const plan2 = game.aiPlan(p);
        const b = plan2.find((a) => a.type === 'build');
        if (b) { game.build(b.tile); await new Promise((x) => setTimeout(x, 300)); }
      }
    }

    await new Promise((x) => setTimeout(x, 420));
    game.endTurn();
    return true;
  }

  // 轮到 AI 自动走
  let _aiBusy = false;
  let _aiTicket = 0;   // 2026-10-20：代次锁，防 AI 回合并发
  async function aiLoop() {
    // 2026-10-20 修并发：用代次锁（ticket），新调用作废旧循环，避免两条链子同时跑 AI
    if (_aiBusy) { _aiTicket++; return; }
    const myTicket = ++_aiTicket;
    _aiBusy = true;
    try {
      while (true) {
        if (myTicket !== _aiTicket) return;           // 被新调用取代 → 退出
        const p = game.state.players[game.state.turn];
        if (!p || !p.isAI) break;
        await runAITurn();
        if (myTicket !== _aiTicket) return;
      }
      const cur = game.state.players[game.state.turn];
      hint.textContent = cur ? `轮到 ${cur.name}` : '点地块查看 · 右侧操作';
    } finally {
      if (myTicket === _aiTicket) _aiBusy = false;
    }
  }

  // ---------- 加载进度 ----------
  const ld = {
    el: () => document.getElementById('loading'),
    fill: (p) => {
      const f = document.getElementById('ldfill');
      const t = document.getElementById('ldpct');
      const v = Math.max(0, Math.min(100, Math.round(p)));
      if (f) f.style.width = v + '%';
      if (t) t.textContent = v + '%';
    },
    hide: () => {
      const e = document.getElementById('loading');
      if (e) { e.classList.add('hide'); setTimeout(() => e.remove(), 500); }
    },
  };

  const log = (msg) => {
    if (!logEl) return;
    const d = document.createElement('div');
    d.textContent = msg;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    while (logEl.childNodes.length > 60) logEl.removeChild(logEl.firstChild);
  };

  const updateUI = () => {
    if (!game || !playersEl) return;
    const s = game.state;
    playersEl.innerHTML = '';
    s.players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'pl' + (i === s.turn ? ' active' : '');
      row.innerHTML = `<i style="background:${p.color}"></i><b>${p.name}</b><span>$${p.money.toLocaleString('zh-CN')}</span>`;
      playersEl.appendChild(row);
    });
    if (diceEl) diceEl.textContent = s.dice[0] ? `🎲 ${s.dice[0]} + ${s.dice[1]}` : '';
    renderTileInfo();
  };

  const renderTileInfo = () => {
    if (!infoEl) return;
    const idx = appState.selected;
    if (idx < 0) { infoEl.innerHTML = '<div class="dim">点棋盘上的格子看详情</div>'; return; }
    const t = TILES[idx];
    if (!t) return;
    const owner = t.owner != null && game ? game.state.players[t.owner] : null;
    let html = `<div class="ti-name">${t.name}</div>`;
    html += `<div class="ti-row"><span>类型</span><b>${{ property: '地产', railroad: '交通枢纽', utility: '基础设施', go: '起点', jail: '探监', gotojail: '进监狱', parking: '免费停车', chance: '机会', chest: '命运', tax: '税务' }[t.type] || t.type}</b></div>`;
    if (t.price) html += `<div class="ti-row"><span>地价</span><b>$${t.price.toLocaleString('zh-CN')}</b></div>`;
    if (t.houseCost) html += `<div class="ti-row"><span>盖房</span><b>$${t.houseCost.toLocaleString('zh-CN')}</b></div>`;
    if (t.houses) html += `<div class="ti-row"><span>等级</span><b>${'★'.repeat(t.houses)}</b></div>`;
    html += `<div class="ti-row"><span>归属</span><b style="color:${owner ? owner.color : '#8aa'}">${owner ? owner.name : '无主'}</b></div>`;
    infoEl.innerHTML = html;
  };

  let _fakeTimer = null;
  const _fakeTimeouts = [];
  function startFakeProgress(from, to, ms) {
    clearInterval(_fakeTimer);
    const t0 = performance.now();
    _fakeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      ld.fill(from + (to - from) * k);
      if (k >= 1) clearInterval(_fakeTimer);
    }, 120);
  }
  // 2026-10-18 修：假进度的定时器必须能全部清掉，否则会在真进度后面又把数字拉回去
  function stopFakeProgress() {
    clearInterval(_fakeTimer);
    _fakeTimeouts.forEach((t) => clearTimeout(t));
    _fakeTimeouts.length = 0;
  }

  async function boot() {
    hint.textContent = '加载贴图中…';
    ld.fill(5);
    runDiag();
    startFakeProgress(5, 34, 4000);
    _fakeTimeouts.push(setTimeout(() => startFakeProgress(35, 54, 3000), 4200));
    _fakeTimeouts.push(setTimeout(() => startFakeProgress(55, 78, 14000), 7400));
    await Promise.race([preloadTextures(), new Promise((r) => setTimeout(r, 12000))]);
    ld.fill(35);
    await Promise.race([preloadLandmarks(), new Promise((r) => setTimeout(r, 5000))]);
    ld.fill(55);

    hint.textContent = '构建 3D 场景…';
    // 2026-10-18 修：原来加了 9 秒超时，超时就再建一次 World →
    //   手机上第一次还没建完，第二次又开跑，进度从 80 掉回 50（老爹实测到的现象）。
    //   现在只建一次，不再重复。
    ld.fill(62);
    world = new World(canvas);

    // 2026-10-18：格子分帧建，主线程不卡死；进度条跟着真实进度走
    stopFakeProgress();   // ← 把假进度的定时器全部清掉，避免又拉回 50
    hint.textContent = '铺设地块…';
    await world.buildTilesAsync((done, total) => {
      ld.fill(62 + Math.round((done / total) * 24));
    });

    ld.fill(88);
    game = createGame(world, { onLog: log, onUpdate: updateUI });

    // 2026-10-18 修：设置页一出现就把加载遮罩收掉，否则遮罩盖着设置页，看着就是"卡在 88%"
    ld.fill(100);
    setTimeout(() => ld.hide(), 150);

    // 等玩家在设置页选好人数与 AI 配置再开局
    const seats = await waitForSetup();
    const playerCount = seats.length;
    world.setPlayerCount(playerCount);
    game.initPlayers(seats);

    // 建棋子
    for (let i = 0; i < playerCount; i++) {
      world.createToken(i, 0);
    }
    world.setFollow(0);

    // 2026-10-18：接入 2D 版验证过的星宿逻辑（原样搬，不改一行）
    try {
      const compat = installCompat(game, world, {
        log,
        refreshUI: updateUI,
        TILES,
      });
      await compat.loadLegacy();
    } catch (e) {
      console.warn('[legacy] 星宿加载失败', e);
      log('⚠️ 星宿引擎加载失败：' + e.message);
    }

    // 2026-10-18：反作弊守卫（温和版：抓到只提示，不封禁）
    let guard = null;
    try {
      guard = createCheatGuard(game, {
        TILES,
        onDetect: (res) => showCheatPopup(res, false),
        onRepeat: (res) => showCheatPopup(res, true),
      });
      guard.snapshot();
      _guardRef = guard;
    } catch (e) {
      console.warn('[guard] 初始化失败', e);
    }

    // 点击：选中地块
    world.onPick((tileIndex) => {
      appState.lastPick = tileIndex;
      appState.selected = tileIndex;
      renderTileInfo();
      const t = TILES[tileIndex];
      hint.textContent = `选中【${t?.name || tileIndex}】`;
    });

    // 3D 先藏到高空，等用户点「开始」再砸下来
    if (world.boardGroup) world.boardGroup.position.y += 46;
    world.start();
    appState.ready = true;


    // 2026-10-18：入场 —— 2D 棋盘 → 3D 砸下来压碎
    //   加超时保护：动画卡住也不能把人挡在门外（低端机/无 GPU 环境）
    try {
      await Promise.race([
        playIntro(),
        new Promise((r) => setTimeout(r, 7000)),
      ]);
    } catch (e) {
      console.warn('[intro]', e);
    }
    // 兜底：万一遮罩还在，强制收掉
    document.querySelectorAll('#loading, #popupbackground').forEach((el) => {
      if (el && el.id === 'loading') el.remove();
    });

    // 2026-10-20 干净版：旧开局钩子全部断开（隐藏卡 / 奇遇 / 赐福投票）
    //   代码保留，想恢复把下面注释放开即可
    // try {
    //   if (window.CNCards?.rollHiddenPresence) window.CNCards.rollHiddenPresence();
    //   if (window.Encounter) {
    //     window.Encounter.roll();
    //     window.Encounter.applyOnStart();
    //     window.Encounter.announce();
    //   }
    //   if (window.Boon?.startVote) {
    //     setTimeout(() => window.Boon.startVote(() => log('赐福投票结束')), 400);
    //   }
    // } catch (e) {
    //   console.warn('[开局钩子]', e);
    // }

    hint.textContent = '点地块查看 · 右侧操作';

    bindButtons();
    updateUI();
    log(`游戏开始，共 ${seats.length} 名玩家`);

    // 2026-10-18：入场动画后再绑一次，防止按钮被替换后丢监听
    setTimeout(() => { bindButtons(); updateUI(); }, 1500);
  }

  // 2026-10-18：按钮绑定改成幂等（先克隆替换，清掉旧监听），可重复调用
  // 2026-10-18：改成document级事件委托——按钮被替换/重建都不会丢监听
  let _buttonsBound = false;
  function bindButtons() {
    if (_buttonsBound) return;
    _buttonsBound = true;

    document.addEventListener('click', (e) => {
      const t = e.target;
      const btn = t?.closest?.('button[id]');
      if (!btn) return;
      const id = btn.id;
      if (id === 'btnRoll') return onRoll();
      if (id === 'btnBuy') return onBuy();
      if (id === 'btnBuild') return onBuild();
      if (id === 'btnSell') return onSell();
      if (id === 'btnEnd') return onEndTurn();
    }, true);   // 捕获阶段，先于其他监听

    console.log('[buttons] 已用事件委托绑定');
    return;
  }

  // ---------- 按钮动作（供事件委托调用） ----------
  async function onRoll() {
    const rollBtn = document.getElementById('btnRoll');
    if (!game || !game.state.started) return;
    if (game.state.hasRolled) {
      hint.textContent = '本回合已经掷过了，点「结束回合」交给下一位';
      return;
    }
    if (rollBtn) rollBtn.disabled = true;
    let r = await game.roll();
    let guardTimes = 0;
    while (r && r.extraRoll > 0 && guardTimes < 5) {
      guardTimes++;
      await new Promise((x) => setTimeout(x, 500));
      hint.textContent = `🎲 再掷一次（剩余 ${r.extraRoll - 1} 次）`;
      r = await game.roll(true);
      if (r) {
        appState.selected = r.to;
        renderTileInfo();
        game.payRent(r.to, r.dice[0] + r.dice[1]);
      }
    }
    if (r) {
      // 2026-10-20：关在监狱里没掷出双数 → 提示并结束
      if (r.jailed) {
        hint.textContent = '⛓️ 未掷出双数，仍被关押（点「结束回合」）';
        if (rollBtn) rollBtn.disabled = false;
        return;
      }
      appState.selected = r.to;
      renderTileInfo();
      game.payRent(r.to, r.dice[0] + r.dice[1]);
      const t = TILES[r.to];
      // 2026-10-20：踩到「进监狱」格 → 提示
      if (t && t.type === 'gotojail') {
        hint.textContent = '⛓️ 被送进监狱！掷出双数才能出狱';
      } else if (t && t.type === 'jail') {
        hint.textContent = '👀 探监区（路过而已）';
      } else if (t && t.type === 'tax') {
        hint.textContent = `🧾 缴纳【${t.name}】$${t.amount}`;
      } else if (t && t.type === 'parking') {
        hint.textContent = '🅿️ 免费停车，歇一回合';
      } else if (t && t.owner == null && (t.type === 'property' || t.type === 'railroad' || t.type === 'utility')) {
        hint.textContent = `【${t.name}】无主，可以买下（$${t.price}）`;
      }
    }
    if (rollBtn) rollBtn.disabled = false;
  }

  function onBuy() {
    if (!game) return;
    const idx = appState.selected < 0 ? game.state.players[game.state.turn].position : appState.selected;
    const r = game.buy(idx);
    hint.textContent = r.msg;
    if (r.ok && r.tile) {
      const t = r.tile;
      const p = r.player;
      const html = `
        <div style="padding:18px 16px 14px;text-align:center">
          <div style="font-size:40px;margin-bottom:8px">🏴</div>
          <div style="font-size:12px;letter-spacing:4px;color:#9fe0ff;margin-bottom:8px">购 地 成 功</div>
          <div style="font-size:22px;font-weight:900;color:#ffd86a;letter-spacing:2px;margin-bottom:12px">${t.name}</div>
          <div style="display:flex;justify-content:space-between;padding:6px 4px;border-bottom:1px dashed rgba(120,180,215,.25);font-size:13px;color:#cfc3ae">
            <span>地价</span><b style="color:#ff8a8a">-${fmtMoney(t.price)}</b>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 4px;border-bottom:1px dashed rgba(120,180,215,.25);font-size:13px;color:#cfc3ae">
            <span>剩余现金</span><b style="color:#ffd86a">${fmtMoney(p.money)}</b>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 4px;font-size:13px;color:#cfc3ae">
            <span>归属</span><b style="color:${p.color}">${p.name}</b>
          </div>
          <div style="margin-top:12px;font-size:11px;color:#7a6a52;line-height:1.6">
            地上一面小旗已经升起来了
          </div>
        </div>`;
      window.popup(html, null, 'close');

      // 2026-10-20：凑齐同色组 → 必抽一张大吉命运卡
      if (r.setBonus) {
        setTimeout(() => {
          if (window.Oracle && window.Oracle.trigger) {
            window.Oracle.trigger('fate', p, () => {}, { forceLevel: 'daji' });
          }
        }, 600);
      }
    }
  }

  function onBuild() {
    if (!game) return;
    const idx = appState.selected < 0 ? game.state.players[game.state.turn].position : appState.selected;
    const r = game.build(idx);
    hint.textContent = r.msg;
  }

  // 2026-10-20：卖地盘（负债自救靠这个）。选中格子优先，没选则卖脚下
  function onSell() {
    if (!game) return;
    const idx = appState.selected < 0 ? game.state.players[game.state.turn].position : appState.selected;
    const r = game.sell(idx);
    hint.textContent = r.msg;
    if (r.bankrupt) {
      hint.textContent = r.msg + ' —— 资不抵债，宣告破产';
    }
  }

  function onEndTurn() {
    if (!game) return;
    // 2026-10-20 修 bug：没掷骰子不许结束回合（防跳过掷骰直接换人）
    if (!game.state.hasRolled) {
      hint.textContent = '还没掷骰子，先掷骰再结束回合';
      return;
    }
    checkCheat(false);
    const p = game.endTurn();
    hint.textContent = `轮到 ${p.name}`;
    const rollBtn = document.getElementById('btnRoll');
    if (rollBtn) rollBtn.disabled = false;
    aiLoop();
  }


  boot().catch((e) => {
    console.error('[3D] 启动失败', e);
    hint.textContent = '启动失败'; 
    diag('❌ 启动失败: ' + (e.stack || e.message).slice(0, 300));
  });


  // ---------- 转场：2D 棋盘 → 3D 棋盘从天而降压碎它 ----------
  async function playIntro() {
    // 先做一张 2D 棋盘快照作为「旧棋盘」，贴在屏幕上等人按开始
    const snap = document.createElement('canvas');
    snap.width = window.innerWidth;
    snap.height = window.innerHeight;
    drawFake2D(snap.getContext('2d'), snap.width, snap.height);

    const layer = document.createElement('canvas');
    layer.width = snap.width; layer.height = snap.height;
    layer.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:800;';
    layer.getContext('2d').drawImage(snap, 0, 0);
    document.body.appendChild(layer);

    const startWrap = document.createElement('div');
    startWrap.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:820;';
    const startBtn = document.createElement('button');
    startBtn.textContent = '▶ 开始游戏';
    startBtn.style.cssText = 'padding:16px 46px;font-size:20px;font-weight:800;font-family:inherit;' +
      'border-radius:40px;border:2px solid #ffcf4d;cursor:pointer;letter-spacing:3px;' +
      'background:linear-gradient(160deg,#fffdf7,#fdf3dc);color:#6b4e12;' +
      'box-shadow:0 6px 0 #e8b93a,0 12px 30px rgba(0,0,0,.5);';
    startWrap.appendChild(startBtn);
    document.body.appendChild(startWrap);

    await new Promise((res) => startBtn.addEventListener('click', res, { once: true }));
    startWrap.remove();

    // 3D 棋盘已经在高空待命（由 boot 提前设好），现在砸下来
    hint.textContent = '棋盘降临…';
    const slam = slamDown(world, { height: 46, duration: 820 });
    await new Promise((r) => setTimeout(r, 180));
    // 砸下同时把它下面的 2D 棋盘压碎
    const crush = crushBoard(snap, { cell: 15, duration: 1800, outPower: 10 });
    await slam;
    layer.remove();
    impactBurst({ duration: 720 });
    await crush;
    log('3D 棋盘降临');
  }

  // 画一个简易 2D 棋盘快照（仅用于转场素材）
  function drawFake2D(ctx, W, H) {
    const size = Math.min(W, H) * 0.82;
    const left = (W - size) / 2;
    const top = (H - size) / 2;
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(0, 0, W, H);
    // 外框
    ctx.fillStyle = '#a8d8ea';
    ctx.fillRect(left - 6, top - 6, size + 12, size + 12);
    // 中心
    ctx.fillStyle = '#cfe9f5';
    ctx.fillRect(left, top, size, size);
    // 格子环
    const n = 11;
    const c = size / n;
    const isEdge = (r, col) => r === 0 || col === 0 || r === n - 1 || col === n - 1;
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        if (!isEdge(r, col)) continue;
        ctx.fillStyle = (r === 0 || col === 0 || r === n - 1 || col === n - 1)
          ? (((r === 0 || r === n - 1) && (col === 0 || col === n - 1)) ? '#ffe9a8' : '#fffdf7')
          : '#fffdf7';
        ctx.fillRect(left + col * c + 2, top + r * c + 2, c - 4, c - 4);
      }
    }
    // 中心标题
    ctx.fillStyle = 'rgba(90, 150, 190, .55)';
    ctx.font = `bold ${Math.round(size * 0.055)}px "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('大富翁 · 玄枢', W / 2, H / 2);
  }

  return { state: appState, get world() { return world; }, get game() { return game; }, playIntro };
}
