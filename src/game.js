// 肥鱼 · 3D 大富翁 —— 最小可玩闭环
// 2026-10-18 v0.3：点格子 → 买地 → 盖房 → 掷骰子
// 说明：这里是「3D 版独立的最小玩法」，不依赖 2D 版的 5800 行逻辑；
//      后续再把 108 星宿 / 赐福 / 奇遇 / 核弹 整套接进来。

import { TILES } from './data/tiles.js';
import { PLAYER_COLORS_CSS, TOKEN_NAMES } from './three/world.js';
import { PERSONAS, shouldBuy, shouldBuild, pickBuildTile } from './ai.js';

export function createGame(world, hooks = {}) {
  const { onLog = () => {}, onUpdate = () => {} } = hooks;

  const state = {
    players: [],
    turn: 0,
    started: false,
    rolling: false,
    dice: [0, 0],
    hasRolled: false,   // 2026-10-18：本回合是否已掷过骰子
  };

  // ---------- 初始化玩家 ----------
  // config: [{ isAI, persona, name }] 或简单人数
  function initPlayers(config = 4) {
    let seats;
    if (Array.isArray(config)) seats = config;
    else seats = Array.from({ length: config }, () => ({ isAI: false }));

    state.players = [];
    seats.forEach((cfg, i) => {
      const persona = cfg.isAI
        ? (cfg.persona || PERSONAS[i % PERSONAS.length].id)
        : null;
      const personaObj = persona ? PERSONAS.find((p) => p.id === persona) : null;
      state.players.push({
        id: i,
        name: cfg.name || (cfg.isAI ? (personaObj?.name || `电脑${i + 1}`) : (TOKEN_NAMES[i] || `玩家${i + 1}`)),
        color: PLAYER_COLORS_CSS[i % PLAYER_COLORS_CSS.length],
        colorHex: PLAYER_COLORS_CSS[i % PLAYER_COLORS_CSS.length],
        money: 10000,
        coins: 5,
        position: 0,
        jail: false,
        isAI: !!cfg.isAI,
        persona,
        human: !cfg.isAI,
        starBankruptShield: 0,
        starShield: 0,
        starReflect: 0,
        starSkip: 0,
        starIsolate: 0,
        starLimitMove: 0,
        starExtraRoll: 0,
        starFreeRent: 0,
        starDoubleDice: 0,
        starHalfPrice: 0,
        starJailCard: 0,
        starJailCompanion: 0,
      });
    });
    state.turn = 0;
    state.started = true;
    onUpdate(state);
  }

  // ---------- AI 决策：本回合该干什么 ----------
  function aiPlan(player) {
    const acts = [];
    // 买地（当前所在格）
    const here = TILES[player.position];
    if (here && shouldBuy(player, here, TILES)) {
      acts.push({ type: 'buy', tile: player.position });
    }
    // 盖房（2026-10-20 真性格版：shouldBuild 需要 TILES 判断同色组）
    const idx = pickBuildTile(player, TILES);
    if (idx >= 0 && shouldBuild(player, TILES[idx], TILES)) {
      acts.push({ type: 'build', tile: idx });
    }
    return acts;
  }

  /* ============================================================
   * 2026-10-20：监狱机制（原来只有 jail 字段没有逻辑）
   *   ① 踩到「进监狱」格 → 送进监狱（第 10 格探监区），跳过起点工资
   *   ② 在监狱里：必须先掷出双数才能出狱，否则本回合停下
   *   ③ 有「出狱令」可以立刻用掉出狱
   * ============================================================ */
  const JAIL_POS = 10;   // 第 10 格 = 探监（关押位置）

  async function sendToJail(p) {
    p.jail = true;
    p.position = JAIL_POS;
    p.jailTurns = 0;
    if (world?.moveToken) {
      try { await world.moveToken(p.id, p.position, 0); } catch (e) {}
    }
    if (world?.placeToken) world.placeToken(p.id, JAIL_POS);
    onLog(`⛓️ ${p.name} 被送进监狱（掷出双数才能出狱）`);
    onUpdate(state);
  }

  /** 尝试出狱：返回 { out: bool, msg } */
  function tryLeaveJail(p, dice) {
    if (!p.jail) return { out: true, msg: '' };
    const isDouble = dice && dice[0] === dice[1];

    // 有出狱令先用
    if (p.starJailCard > 0) {
      p.starJailCard--;
      p.jail = false;
      p.jailTurns = 0;
      onLog(`🎫 ${p.name} 使用「出狱令」出狱`);
      return { out: true, msg: '使用出狱令出狱' };
    }

    if (isDouble) {
      p.jail = false;
      p.jailTurns = 0;
      onLog(`🎲 ${p.name} 掷出双数，成功出狱`);
      return { out: true, msg: '掷出双数，出狱' };
    }

    p.jailTurns = (p.jailTurns || 0) + 1;
    // 第 3 次仍未掷出双数 → 交罚金 $2000 强制出狱
    if (p.jailTurns >= 3) {
      p.money -= 2000;
      p.jail = false;
      onLog(`💰 ${p.name} 三次未掷出双数，缴纳 $2000 罚金出狱`);
      p.jailTurns = 0;
      return { out: true, msg: '缴纳罚金出狱' };
    }

    onLog(`⛓️ ${p.name} 未掷出双数，继续关押（第 ${p.jailTurns}/3 次）`);
    return { out: false, msg: `未掷出双数，继续关押（${p.jailTurns}/3）` };
  }

  // ---------- 掷骰子 ----------
  async function roll(force = false) {
    // 2026-10-20：拒绝掷骰时给出原因，别静默返回 null
    if (!state.started) { onLog('⚠️ roll 被拒：游戏未开始'); return null; }
    if (state.rolling) { onLog('⚠️ roll 被拒：上一掷骰尚未结束（rolling=true）'); return null; }
    const p = state.players[state.turn];
    if (!p) { onLog('⚠️ roll 被拒：当前玩家不存在'); return null; }
    // 2026-10-18：一个回合只能掷一次；卡牌「再掷」走 force=true
    if (state.hasRolled && !force) { onLog('⚠️ roll 被拒：本回合已掷过'); return null; }

    state.rolling = true;
    state.hasRolled = true;
    try {
    let d1 = 1 + Math.floor(Math.random() * 6);
    let d2 = 1 + Math.floor(Math.random() * 6);

    // 2026-10-20：应用玄枢法门带来的掷骰机制（用掉即清）
    if (p.nextDiceBonus) {
      const b = p.nextDiceBonus;
      d1 = Math.max(1, d1 + b);
      d2 = Math.max(1, d2 + b);
      onLog(`☯ 动爻之力：掷骰 ${b > 0 ? '+' : ''}${b}`);
      p.nextDiceBonus = 0;
    }
    if (p.nextDiceHalf) {
      d1 = Math.max(1, Math.ceil(d1 / 2));
      d2 = Math.max(1, Math.ceil(d2 / 2));
      onLog('🌌 凶门当值：掷骰减半');
      p.nextDiceHalf = 0;
    }

    state.dice = [d1, d2];
    onLog(`${p.name} 掷出 ${d1} + ${d2} = ${d1 + d2}`);

    // 2026-10-20：在监狱里 → 先判能不能出狱
    if (p.jail) {
      const jr = tryLeaveJail(p, [d1, d2]);
      if (!jr.out) {
        state.rolling = false;
        onUpdate(state);
        return { player: p, from: JAIL_POS, to: JAIL_POS, tile: TILES[JAIL_POS], dice: [d1, d2], extraRoll: 0, jailed: true };
      }
      // 出狱了：用这次骰子的点数继续走
    }

    if (world?.animateDice) {
      await world.animateDice(d1, d2, 1.0, 0.5);
    }

    const from = p.position;
    const steps = d1 + d2;
    if (world?.moveToken) {
      await world.moveToken(p.id, from, steps);
    }
    const to = ((from + steps) % 40 + 40) % 40;
    p.position = to;

    const t = TILES[to] || {};
    onLog(`${p.name} 走到【${t.name || to}】`);

    // 经过起点领工资（2026-10-20：收入先抵负债）
    if (from + steps >= 40) {
      const gain = gainMoney(p, 10000);
      onLog(`${p.name} 经过起点，领取 $10000${gain.offset > 0 ? `（其中 $${gain.offset} 自动抵债）` : ''}`);
      // 2026-10-20 干净版：赐福钩子已断开（代码保留未加载）
      // try { if (window.Boon?.onPassStart) window.Boon.onPassStart(p); } catch (e) {}
    }
    // 2026-10-20 干净版：赐福「利滚利」四角结算已断开
    // try {
    //   const cornerCrossed = Math.floor((from + steps) / 10) > Math.floor(from / 10);
    //   if (cornerCrossed && window.Boon?.onPassCorner) window.Boon.onPassCorner(p, to);
    // } catch (e) {}

    state.rolling = false;
    onUpdate(state);

    // 2026-10-18：卡牌「再掷一次」——读完标记并消耗一次
    let extra = 0;
    if (p.starExtraRoll === true) { p.starExtraRoll = 1; }
    if (typeof p.starExtraRoll === 'number' && p.starExtraRoll > 0) {
      extra = p.starExtraRoll;
      p.starExtraRoll = 0;   // 一次性用掉，由调用方决定是否继续掷
      onLog(`${p.name} 触发「再掷一次」（剩余 ${extra} 次）`);
    }

    // 2026-10-20 修：踩到「进监狱」格 → 真的送进监狱（原来没实现）
    if (t && t.type === 'gotojail') {
      await sendToJail(p);
    }

    // 2026-10-20 修：踩到税务格 → 真的扣钱（原来只显示格子，不扣）
    if (t && t.type === 'tax') {
      const amt = t.amount || 0;
      if (amt > 0) {
        p.money -= amt;
        onLog(`🧾 ${p.name} 缴纳【${t.name}】$${amt}`);
        onUpdate(state);
        // 交完可能资不抵债
        checkBankrupt(p);
      }
    }

    // 2026-10-19 老爹定：落格触发机会/命运卡（照 2D 版 land() 的顺序：星宿在前，卡牌在后）
    //   depth 用来防连环：抽到「前进」卡后再落在机会格，最多再触发 1 次
    try {
      await triggerLanding(to, 0);
    } catch (e) {
      onLog('⚠️ 落格事件出错：' + (e && e.message));
    }

    return { player: p, from, to, tile: t, dice: [d1, d2], extraRoll: extra };
    } finally {
      // 2026-10-20 修：任何异常都必须释放 rolling，否则后续 AI 的 roll 全被吞成 null
      state.rolling = false;
    }
  }

  /**
   * 落格事件：玄枢机会 / 命运（2026-10-20 干净版）
   * 星宿系统已断开（代码保留未加载）
   * @param {number} tileIdx 落点
   * @param {number} depth 递归深度（0=首次落格；>=1 时不再连锁触发）
   */
  async function triggerLanding(tileIdx, depth = 0) {
    const p = state.players[state.turn];
    if (!p) return;
    const t = TILES[tileIdx];
    if (!t) return;

    const isChanceTile = [2, 17, 33].includes(tileIdx);
    const isChestTile = [7, 22, 36].includes(tileIdx);

    // 玄枢机会 / 命运（时间 → SHA-256 → 卦签 → 吉凶）
    if (depth === 0 && window.Oracle && window.Oracle.trigger) {
      const kind = isChanceTile ? 'chance' : (isChestTile ? 'fate' : null);
      if (kind) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 12000);   // 兜底，弹窗卡住也不锁死流程
          window.Oracle.trigger(kind, p, () => { clearTimeout(timer); resolve(); });
        });
        // 卦签可能把玩家挪到新格（倒退）→ 新落点再判一次（只判一层）
        if (p.position !== tileIdx) {
          await triggerLanding(p.position, depth + 1);
        }
      }
    }
  }

  /* ============================================================
   * 2026-10-20 老爹定：负债规则
   *   ① 负债时不能买地、不能盖房
   *   ② 所有收入自动优先还债（把负数补平，多的才进自己口袋）
   *   ③ 地盘玩家自己卖（默认不自动卖）
   *   ④ 卖光所有资产还抵不平 → 破产
   * ============================================================ */

  const isDebt = (p) => !!p && p.money < 0;

  /** 进账：先补负债，返回 { gain, offset }（offset = 用于还债的金额） */
  function gainMoney(p, amount) {
    if (!p || !amount) return { gain: 0, offset: 0 };
    const before = p.money || 0;
    p.money = before + amount;
    const offset = before < 0 ? Math.min(amount, -before) : 0;
    return { gain: amount, offset };
  }

  /** 玩家名下可卖资产（地盘含房子） */
  function ownedTiles(p) {
    return TILES.map((t, i) => ({ t, i })).filter((x) => x.t.owner === p.id);
  }

  /** 资产总值：地价一半 + 房子半价（按 3D 版简化定价） */
  function assetValue(p) {
    let v = 0;
    ownedTiles(p).forEach(({ t }) => {
      v += Math.round((t.price || 0) * 0.5);
      const lv = t.houses || 0;
      v += Math.round((t.houseCost || (t.price || 0) * 0.5) * 0.5 * lv);
    });
    return v;
  }

  /** 卖一块地：先卖房、再卖地。返回 { ok, msg, gain } */
  function sell(tileIdx) {
    const p = state.players[state.turn];
    const t = TILES[tileIdx];
    if (!p || !t) return { ok: false, msg: '无效地块' };
    if (t.owner !== p.id) return { ok: false, msg: '这块地不是你的' };

    let gain = 0;
    let what = '';

    const lv = t.houses || 0;
    if (lv > 0) {
      // 先卖一级房
      const houseCost = t.houseCost || Math.round((t.price || 0) * 0.5);
      gain = Math.round(houseCost * 0.5);
      t.houses = lv - 1;
      if (world?.setHouses) world.setHouses(tileIdx, t.houses);
      what = `卖掉【${t.name}】上的一级建筑`;
    } else {
      // 没房了 → 卖地
      gain = Math.round((t.price || 0) * 0.5);
      t.owner = null;
      if (world?.setOwner) world.setOwner(tileIdx, null);
      what = `卖掉【${t.name}】`;
    }

    p.money += gain;
    onLog(`${what}，得 $${gain}`);
    onUpdate(state);

    // 卖完检查破产
    const status = checkBankrupt(p);
    return { ok: true, msg: `${what}，得 $${gain}`, gain, bankrupt: status.bankrupt };
  }

  /** 破产检查：负债且卖光所有资产仍还不完 → 破产 */
  function checkBankrupt(p) {
    if (!p || p.money >= 0) return { bankrupt: false };
    const remain = assetValue(p);
    if (p.money + remain >= 0) return { bankrupt: false, canPay: true, remain };
    // 卖光也还不完 → 破产
    p.bankrupt = true;
    onLog(`💀 ${p.name} 资不抵债（负债 $${-p.money}，全部资产仅值 $${remain}），宣告破产`);
    onUpdate(state);
    return { bankrupt: true, remain };
  }

  // ---------- 买地 ----------
  function buy(tileIdx) {
    const p = state.players[state.turn];
    const t = TILES[tileIdx];
    if (!p || !t) return { ok: false, msg: '无效地块' };

    if (t.type !== 'property' && t.type !== 'railroad' && t.type !== 'utility') {
      return { ok: false, msg: '这块地不能买' };
    }
    if (t.owner != null) return { ok: false, msg: '这块地已经有主了' };
    // 2026-10-20：伤门当值 → 本回合禁买地
    if (p.noBuyNext) {
      p.noBuyNext = 0;
      return { ok: false, msg: '⚔ 伤门当值，本回合不能买地' };
    }
    // 2026-10-20 老爹定：负债状态不能买地
    if (isDebt(p)) return { ok: false, msg: `负债中（$${p.money}），不能买地，先把债还了` };
    if (p.money < t.price) return { ok: false, msg: `现金不足，还差 $${t.price - p.money}` };

    p.money -= t.price;
    t.owner = p.id;
    if (world?.setOwner) world.setOwner(tileIdx, p.colorHex);
    // 2026-10-18：买地反馈加强——格子升起玩家色小旗
    if (world?.flagTile) world.flagTile(tileIdx, p.colorHex);
    onLog(`🏴 ${p.name} 花 $${t.price} 买下【${t.name}】`);
    onUpdate(state);

    // 2026-10-20 老爹定：凑齐同色组 → 必抽一张「大吉」命运卡
    let setBonus = false;
    if (t.type === 'property' && t.color) {
      const same = TILES.filter((x) => x.type === 'property' && x.color === t.color);
      const allMine = same.every((x) => x.owner === p.id);
      if (allMine && same.length > 1) {
        setBonus = true;
        onLog(`✨ ${p.name} 凑齐【${t.color}】同色组 ${same.length} 块！命数垂青，必得大吉`);
      }
    }

    return { ok: true, msg: `🏴 你买下了【${t.name}】，花 $${t.price}`, tile: t, player: p, setBonus, color: t.color };
  }

  // ---------- 盖房 ----------
  function build(tileIdx) {
    const p = state.players[state.turn];
    const t = TILES[tileIdx];
    if (!p || !t) return { ok: false, msg: '无效地块' };
    if (t.owner !== p.id) return { ok: false, msg: '这块地不是你的' };
    if (t.type !== 'property') return { ok: false, msg: '这块地不能盖房' };
    // 2026-10-20：杜门当值 → 本回合禁盖房
    if (p.noBuildNext) {
      p.noBuildNext = 0;
      return { ok: false, msg: '🚪 杜门闭塞，本回合不能盖房' };
    }
    // 2026-10-20 老爹定：负债状态不能盖房
    if (isDebt(p)) return { ok: false, msg: `负债中（$${p.money}），不能盖房，先把债还了` };

    const lv = t.houses || 0;
    if (lv >= 5) return { ok: false, msg: '已经盖到最高级了' };

    const cost = t.houseCost || Math.round(t.price * 0.5);
    if (p.money < cost) return { ok: false, msg: `现金不足，还差 $${cost - p.money}` };

    p.money -= cost;
    t.houses = lv + 1;
    if (world?.setHouses) world.setHouses(tileIdx, t.houses);
    onLog(`${p.name} 花 $${cost} 把【${t.name}】升到 ${t.houses} 级`);
    onUpdate(state);
    return { ok: true, msg: `【${t.name}】升到 ${t.houses} 级` };
  }

  // ---------- 交租 ----------
  function payRent(tileIdx, diceSum) {
    const t = TILES[tileIdx];
    if (!t || t.owner == null) return null;
    const payer = state.players[state.turn];
    const owner = state.players[t.owner];
    if (!payer || !owner || payer.id === owner.id) return null;

    let rent = 0;
    if (t.type === 'property') {
      const lv = t.houses || 0;
      rent = (t.rents && t.rents[Math.min(lv, t.rents.length - 1)]) || 0;
    } else if (t.type === 'railroad') {
      const n = TILES.filter((x) => x.type === 'railroad' && x.owner === owner.id).length;
      rent = (t.price || 0) * Math.pow(2, Math.max(0, n - 1)) * 0.25;
    } else if (t.type === 'utility') {
      rent = (diceSum || 7) * (t.price || 0) * 0.04;
    }
    rent = Math.round(rent);
    if (rent <= 0) return null;

    // 2026-10-20：吉门护身 → 本回合免交一次过路费
    if (payer.freeRentNext > 0) {
      payer.freeRentNext--;
      onLog(`🛡️ ${payer.name} 借吉门之力，免交本次过路费 $${rent}`);
      onUpdate(state);
      return 0;
    }

    // 2026-10-20：塔罗逆位 → 受创反弹给出手方
    if (payer.reflectNext > 0) {
      payer.reflectNext--;
      payer.money -= rent;
      owner.money -= rent;          // 出手方反被扣
      onLog(`🃏 ${payer.name} 逆位护体：向 ${owner.name} 的 $${rent} 原数反弹`);
      onUpdate(state);
      return -rent;
    }

    payer.money -= rent;
    const ownerGain = gainMoney(owner, rent);   // 收租方若负债，先抵债
    onLog(`${payer.name} 向 ${owner.name} 支付租金 $${rent}${ownerGain.offset > 0 ? `（其中 $${ownerGain.offset} 自动抵债）` : ''}`);
    onUpdate(state);
    return rent;
  }

  // ---------- 结束回合 ----------
  function endTurn() {
    state.hasRolled = false;   // 2026-10-18：换人 → 可以重新掷
    state.rolling = false;     // 2026-10-20 修：换人时必须清掉掷骰锁，否则下一个 AI 的 roll 会被拒
    state.turn = (state.turn + 1) % state.players.length;
    if (world?.setFollow) world.setFollow(state.turn);
    onUpdate(state);
    return state.players[state.turn];
  }

  return { state, initPlayers, roll, buy, build, payRent, endTurn, aiPlan, sell, gainMoney, checkBankrupt, assetValue, ownedTiles, isDebt, sendToJail, tryLeaveJail, JAIL_POS };
}
