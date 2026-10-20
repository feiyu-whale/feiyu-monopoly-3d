// 肥鱼 · 3D 大富翁 —— 反作弊检测（温和版）
// 2026-10-18 老爹定：严肃取证 + 玩梗提示，抓到不封禁，只标记「本局不算数」

/**
 * 检测器：每回合比对一次基准值，发现异常就报告（只报第一次）
 */
export function createCheatGuard(game, hooks = {}) {
  const { onDetect = () => {}, onRepeat = () => {}, TILES = [] } = hooks;

  // 基准快照：开局时记录
  let baseline = null;
  let detected = false;
  let hitCount = 0;

  /** 记录当前快照作为基准（开局/正常结算后调用） */
  function snapshot() {
    const s = game.state;
    baseline = {
      players: s.players.map((p) => ({
        id: p.id,
        money: p.money,
        coins: p.coins || 0,
        position: p.position,
      })),
      owners: TILES.map((t) => (t.owner == null ? -1 : t.owner)),
    };
  }

  /**
   * 检查一次。返回 null 表示正常，否则返回证据对象
   * @param {object} opts { reason: 允许的合法变动来源，如 'rent'|'card'|'pass-go' }
   */
  function check(opts = {}) {
    if (!baseline) { snapshot(); return null; }
    const s = game.state;
    const allowGain = !!opts.allowGain;   // 允许现金增加（如刚结算完卡牌）

    const evidence = [];

    // 1) 现金暴涨（超过基准 50 倍且绝对值 > 100 万，视为异常）
    for (const p of s.players) {
      const b = baseline.players.find((x) => x.id === p.id);
      if (!b) continue;
      const base = b.money + (b.coins || 0) * 10000;
      const now = p.money + (p.coins || 0) * 10000;
      if (!allowGain && base > 0 && now > base * 50 && now - base > 1e6) {
        evidence.push(`玩家「${p.name}」现金由 ${fmt(base)} 变为 ${fmt(now)}，无对应游戏内收入来源`);
      }
      // 负数现金：2026-10-19 老爹定，负数本身是「欠债」的合法状态（兑完金币还不够的找零结果），
      //   不再当作弊证据。真正的异常改为「负债期间资产被卖出/抵押」——那是靠卖资产刷图。
      //   旧逻辑（已废）：if (p.money < -1) evidence.push(...)
      // （负数现金本身合法：兑完金币仍不够的找零结果，不再判定）
      // 超出封顶
      if (now > 1e15) {
        evidence.push(`玩家「${p.name}」资产 ${fmt(now)} 已超出上限`);
      }
      // 2026-10-19：负债期间名下地产减少（卖房/抵押）→ 真异常
      if (p.money < -1 && b) {
        const idx = s.players.indexOf(p);
        const ownedNow = TILES.filter((t) => t.owner === idx).length;
        const ownedBefore = baseline.owners.filter((o) => o === idx).length;
        if (ownedNow < ownedBefore) {
          evidence.push(`玩家「${p.name}」现金为负（${fmt(p.money)}）期间减少了 ${ownedBefore - ownedNow} 块地产，靠卖资产抵债`);
        }
      }
    }

    // 2) 骰子越界
    const d = s.dice || [0, 0];
    if (d[0] && (d[0] < 1 || d[0] > 6)) evidence.push(`骰子出现非法点数 ${d[0]}`);
    if (d[1] && (d[1] < 1 || d[1] > 6)) evidence.push(`骰子出现非法点数 ${d[1]}`);

    // 3) 地块归属被改成不存在的玩家
    TILES.forEach((t, i) => {
      if (t.owner != null && (t.owner < 0 || t.owner >= s.players.length)) {
        evidence.push(`第 ${i} 号地块归属异常（玩家编号 ${t.owner} 不存在）`);
      }
    });

    // 4) 位置越界
    for (const p of s.players) {
      if (p.position == null || p.position < 0 || p.position > 39) {
        evidence.push(`玩家「${p.name}」位置非法（${p.position}）`);
      }
    }

    if (!evidence.length) return null;

    hitCount++;
    const result = { evidence, count: hitCount };
    if (!detected) {
      detected = true;
      onDetect(result);
    } else {
      onRepeat(result);
    }
    // 发现后重置基准，避免重复报同一笔
    snapshot();
    return result;
  }

  function fmt(n) {
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

  return {
    snapshot,
    check,
    get detected() { return detected; },
    get hitCount() { return hitCount; },
  };
}
