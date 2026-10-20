/* ============================================================
 * cards.js — 机会 / 命运卡（3D 版）
 * 作用：把 2D 版的 32 张卡牌翻译成 3D 状态（game.state / TILES）可用的写法
 * 依赖：game（state 与动作）、world（棋子移动）、compat 的 popup
 * 作者：肥鱼  2026-10-19
 *
 * 与 2D 的对应关系：
 *   player[i]      → game.state.players[i]
 *   turn           → game.state.turn
 *   square[i]      → TILES[i]
 *   s.house/hotel  → t.houses（0~5，5 表示旅馆）
 *   p.pay()        → 保留（3D 版 Player 有 pay 方法）
 * ============================================================ */

export function installCards(ctx) {
  const { game, world, TILES, log, refreshUI } = ctx;

  const REWARD_ON_PASS_START = 10000;   // 3D 版经过起点给 1 万
  const COIN_PER_PASS = 1;              // 经过起点另给 1 金币

  const S = () => game.state;
  const me = () => S().players[S().turn];
  const others = () => S().players.filter((p) => p.id !== S().turn);

  const say = (txt) => { try { log(txt); } catch (e) {} };
  const sync = () => { try { refreshUI && refreshUI(); } catch (e) {} };

  // ---------- 基础动作 ----------
  function addAmount(amount, cause) {
    const p = me();
    p.money += amount;
    say(`${p.name} 从${cause}获得 $${amount}`);
    sync();
  }

  function subtractAmount(amount, cause) {
    const p = me();
    if (typeof p.pay === 'function') p.pay(amount, -1);
    else p.money -= amount;
    say(`${p.name} 因${cause}失去 $${amount}`);
    sync();
  }

  function payEachPlayer(amount, cause) {
    const p = me();
    let total = 0;
    others().forEach((o) => {
      o.money += amount;
      total += amount;
      if (typeof p.pay === 'function') p.pay(amount, o.id);
      else p.money -= amount;
    });
    say(`${p.name} 因${cause}共付出 $${total}`);
    sync();
  }

  function collectFromEachPlayer(amount, cause) {
    const p = me();
    let total = 0;
    others().forEach((o) => {
      const give = Math.min(o.money, amount);
      if (typeof o.pay === 'function') o.pay(give, p.id);
      else o.money -= give;
      p.money += give;
      total += give;
    });
    say(`${p.name} 从${cause}共获得 $${total}`);
    sync();
  }

  function goToJail() {
    const p = me();
    p.jail = true;
    p.position = 10;
    say(`${p.name} 被送进监狱`);
    if (world?.placeToken) world.placeToken(p.id, 10);
    sync();
  }

  /** 前进到指定格；经过起点领工资 */
  function advance(destination) {
    const p = me();
    const from = p.position;
    // 判断是否经过起点（绕一圈）
    if (destination <= from) {
      p.money += REWARD_ON_PASS_START;
      p.coins = (p.coins || 0) + COIN_PER_PASS;
      say(`${p.name} 经过起点，领取 $${REWARD_ON_PASS_START} 并获得 ${COIN_PER_PASS} 金币`);
    }
    p.position = ((destination % 40) + 40) % 40;
    if (world?.placeToken) world.placeToken(p.id, p.position);
    sync();
  }

  function goBackThree() {
    const p = me();
    p.position = ((p.position - 3) % 40 + 40) % 40;
    if (world?.placeToken) world.placeToken(p.id, p.position);
    sync();
  }

  /** 最近的自来水厂（3D 版：找最近一个 utility 格） */
  function advanceToNearestUtility() {
    const p = me();
    const targets = TILES.map((t, i) => ({ t, i })).filter((x) => x.t.type === 'utility').map((x) => x.i);
    if (!targets.length) return;
    let best = targets[0];
    for (const idx of targets) {
      const d = (idx - p.position + 40) % 40;
      const bd = (best - p.position + 40) % 40;
      if (d !== 0 && d < bd) best = idx;
    }
    advance(best);
  }

  /** 最近的铁路（3D 版：railroad 格） */
  function advanceToNearestRailroad() {
    const p = me();
    const targets = TILES.map((t, i) => ({ t, i })).filter((x) => x.t.type === 'railroad').map((x) => x.i);
    if (!targets.length) return;
    let best = targets[0];
    for (const idx of targets) {
      const d = (idx - p.position + 40) % 40;
      const bd = (best - p.position + 40) % 40;
      if (d !== 0 && d < bd) best = idx;
    }
    advance(best);
  }

  /** 房屋大修：按自己名下房产收维护费 */
  function streetRepairs(perHouse, perHotel) {
    const p = me();
    let cost = 0;
    TILES.forEach((t) => {
      if (t.owner !== p.id) return;
      const lv = t.houses || 0;
      if (lv >= 5) cost += perHotel;
      else cost += lv * perHouse;
    });
    if (cost > 0) {
      if (typeof p.pay === 'function') p.pay(cost, -1);
      else p.money -= cost;
      say(`${p.name} 支付房屋大修费 $${cost}`);
      sync();
    }
  }

  // ---------- 命运卡（Community Chest）16 张 ----------
  const chestCards = [
    { text: '出狱许可证。可保留到需要时使用。', fn: (p) => { p.starJailCard = (p.starJailCard || 0) + 1; } },
    { text: '你在选美比赛中获得二等奖，领取 $100。', fn: () => addAmount(100, '命运') },
    { text: '卖出股票，获得 $500。', fn: () => addAmount(500, '命运') },
    { text: '人寿保险到期，领取 $1000。', fn: () => addAmount(1000, '命运') },
    { text: '所得税退税，领取 $200。', fn: () => addAmount(200, '命运') },
    { text: '假日基金到期，领取 $1000。', fn: () => addAmount(1000, '命运') },
    { text: '你继承了一笔遗产，领取 $1000。', fn: () => addAmount(1000, '命运') },
    { text: '收到咨询费 $250。', fn: () => addAmount(250, '命运') },
    { text: '支付医疗费用 $1000。', fn: () => subtractAmount(1000, '命运') },
    { text: '银行出错，多算了你的钱，领取 $2000。', fn: () => addAmount(2000, '命运') },
    { text: '支付学费 $500。', fn: () => subtractAmount(500, '命运') },
    { text: '看医生，支付 $500。', fn: () => subtractAmount(500, '命运') },
    { text: '今天是你的生日，每位玩家给你 $100。', fn: () => collectFromEachPlayer(100, '命运') },
    { text: '前进到起点，领取工资。', fn: () => advance(0) },
    { text: '房屋大修：每栋房子 $400，每间旅馆 $1150。', fn: () => streetRepairs(400, 1150) },
    { text: '进监狱。不经过起点，不领工资。', fn: () => goToJail() },
  ];

  // ---------- 机会卡（Chance）16 张 ----------
  const chanceCards = [
    { text: '出狱许可证。可保留到需要时使用。', fn: (p) => { p.starJailCard = (p.starJailCard || 0) + 1; } },
    { text: '全屋大修：每栋房子 $250，每间旅馆 $1000。', fn: () => streetRepairs(250, 1000) },
    { text: '超速罚款 $150。', fn: () => subtractAmount(150, '机会') },
    { text: '你被选为董事会主席，向每位玩家支付 $500。', fn: () => payEachPlayer(500, '机会') },
    { text: '后退三格。', fn: () => goBackThree() },
    { text: '前进到最近的自来水厂。', fn: () => advanceToNearestUtility() },
    { text: '银行分红，领取 $500。', fn: () => addAmount(500, '机会') },
    { text: '前进到最近的铁路。', fn: () => advanceToNearestRailroad() },
    { text: '缴纳扶贫税 $150。', fn: () => subtractAmount(150, '机会') },
    { text: '前往雷丁铁路。经过起点可领工资。', fn: () => advance(5) },
    { text: '前进到玻璃金字塔。', fn: () => advance(39) },
    { text: '前进到市政厅钟楼。经过起点可领工资。', fn: () => advance(24) },
    { text: '建筑贷款到期，领取 $1500。', fn: () => addAmount(1500, '机会') },
    { text: '前进到最近的铁路。', fn: () => advanceToNearestRailroad() },
    { text: '前进到大三巴牌坊。经过起点可领工资。', fn: () => advance(1) },
    { text: '进监狱。不经过起点，不领工资。', fn: () => goToJail() },
  ];

  // ---------- 卡牌状态 ----------
  const decks = {
    chance: { cards: chanceCards, index: 0 },
    chest: { cards: chestCards, index: 0 },
  };

  const TYPE_META = {
    chance: { name: '机会', icon: '🌪️', color: '#ff9a4a' },
    chest: { name: '命运', icon: '⚠️', color: '#9fe0ff' },
  };

  /** 抽一张并应用；draw 时自动跳过「出狱许可证」的移出牌堆逻辑（3D 简化：循环抽取） */
  function drawCard(kind) {
    const d = decks[kind];
    if (!d) return null;
    const card = d.cards[d.index % d.cards.length];
    d.index = (d.index + 1) % d.cards.length;
    return card;
  }

  /** 真正的「踩格触发」入口——由 game.roll 落格后调用 */
  async function trigger(kind, player, done) {
    const meta = TYPE_META[kind] || TYPE_META.chance;
    const card = drawCard(kind);
    if (!card) { done && done(); return; }

    // 先应用效果（按 2D 顺序：先 apply 再弹窗，弹窗只是告知）
    try {
      card.fn(player);
    } catch (e) {
      say(`⚠️ 卡牌效果出错：${e.message}`);
    }

    const html = `
      <div style="padding:18px 16px 14px;text-align:center">
        <div style="font-size:38px;margin-bottom:6px">${meta.icon}</div>
        <div style="font-size:12px;letter-spacing:4px;color:${meta.color};margin-bottom:10px">${meta.name}</div>
        <div style="font-size:14px;line-height:1.8;color:#e8dcc8;padding:12px;background:rgba(255,255,255,.04);border-radius:10px">
          ${card.text}
        </div>
      </div>`;

    if (window.popup) {
      window.popup(html, () => { done && done(); }, 'close');
    } else {
      done && done();
    }
  }

  return {
    install: true,
    trigger,
    decks,
    // 供调试
    _fns: { addAmount, subtractAmount, payEachPlayer, collectFromEachPlayer, goToJail, advance, goBackThree, streetRepairs },
  };
}
