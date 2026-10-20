// 肥鱼 · 3D 大富翁 —— AI 大脑 v2（2026-10-20 真性格版）
// 设计原则：每个性格有「不同的算分方式 + 不同的行为规则」，不只是参数微调。
// 零成本、零延迟，纯本地启发式。

export const PERSONAS = [
  {
    id: 'shenyi', name: '沈毅', style: '精明保守',
    buyReserve: 3000, risk: 0.55,
    desc: '只买同色组，凑齐就守着收租，不爱盖房',
  },
  {
    id: 'ahao', name: '阿豪', style: '激进派',
    buyReserve: 500, risk: 0.90,
    desc: '什么地都买，有钱就盖满，负债也敢冲',
  },
  {
    id: 'linda', name: '琳达', style: '科技新贵',
    buyReserve: 1800, risk: 0.70,
    desc: '偏爱贵地和交通枢纽、基础设施',
  },
  {
    id: 'laozhou', name: '老周', style: '老江湖',
    buyReserve: 2000, risk: 0.55,
    desc: '专挑别人凑不齐的色组下手，卡人',
  },
  {
    id: 'xiaomeng', name: '小萌', style: '创业萌新',
    buyReserve: 1200, risk: 0.65,
    desc: '乱买，看心情，偶尔失误',
  },
];

function getPersona(player) {
  return PERSONAS.find((p) => p.id === player.persona) || PERSONAS[player.id % PERSONAS.length];
}

/* ============================================================
 * 各性格的「地价评分」——这是性格差异的核心
 * 返回：基础分（正数=想买）
 * ============================================================ */

// 沈毅：同色组重度加权。关键：新组第一块也必须能买（入场券），
// 否则永远进不了场、永远凑不齐 → 死循环。这是 2026-10-20 发现并修的。
function scoreShenyi(t, player, TILES) {
  if (t.type !== 'property' || !t.color) return 0.6;   // 非地产基本不碰
  const same = TILES.filter((x) => x.type === 'property' && x.color === t.color);
  const mine = same.filter((x) => x.owner === player.id).length;
  const others = same.filter((x) => x.owner != null && x.owner !== player.id).length;
  const price = t.price || 0;

  // ① 已有同组 → 拼命凑齐
  if (mine > 0) return 3.0 + mine * 1.8;

  // ② 别人占了这组 → 不碰（保守派不抢别人的）
  if (others > 0) return 0.2;

  // ③ 全新组：这是入场券，必须买。但保守 → 只挑便宜组入手
  //    便宜组给高分过线，贵组分数低买不起/不愿冒险
  if (price <= 3000) return 2.2;
  if (price <= 8000) return 1.8;
  if (price <= 15000) return 1.2;
  return 0.8;    // 顶级组不碰（保守派不赌大的）
}

// 阿豪：什么都买，越贵越爽
function scoreAhao(t, player, TILES) {
  if (t.type !== 'property' && t.type !== 'railroad' && t.type !== 'utility') return 0;
  let s = 4.0;
  if (t.price >= 20000) s += 2.5;       // 贵地更爽
  else if (t.price >= 8000) s += 1.2;
  // 已成组：加码
  if (t.color) {
    const same = TILES.filter((x) => x.type === 'property' && x.color === t.color);
    const mine = same.filter((x) => x.owner === player.id).length;
    s += mine * 1.0;
  }
  return s;
}

// 琳达：偏爱高价地 + 交通/基础设施
function scoreLinda(t, player, TILES) {
  if (t.type === 'railroad') {
    const mine = TILES.filter((x) => x.type === 'railroad' && x.owner === player.id).length;
    return 4.5 + mine * 2.0;            // 交通枢纽：优先级最高
  }
  if (t.type === 'utility') {
    const mine = TILES.filter((x) => x.type === 'utility' && x.owner === player.id).length;
    return 3.8 + mine * 1.8;
  }
  if (t.type !== 'property') return 0;
  let s = 1.2;
  if (t.price >= 30000) s += 4.0;       // 顶级地
  else if (t.price >= 15000) s += 2.6;
  else if (t.price >= 8000) s += 1.4;
  else s += 0.3;
  if (t.color) {
    const same = TILES.filter((x) => x.type === 'property' && x.color === t.color);
    const mine = same.filter((x) => x.owner === player.id).length;
    s += mine * 1.1;
  }
  return s;
}

// 老周：卡人型——别人有 1 块同色组的地，就去抢同组剩下的
function scoreLaozhou(t, player, TILES) {
  if (t.type !== 'property' || !t.color) {
    if (t.type === 'railroad') {
      const mine = TILES.filter((x) => x.type === 'railroad' && x.owner === player.id).length;
      return 2.2 + mine * 1.0;
    }
    return 0;
  }
  const same = TILES.filter((x) => x.type === 'property' && x.color === t.color);
  const mine = same.filter((x) => x.owner === player.id).length;
  const others = same.filter((x) => x.owner != null && x.owner !== player.id).length;

  if (mine > 0 && others === 0) return 3.2 + mine * 1.5;   // 自己快成组：收
  if (others > 0) return 4.0 + others * 2.2;               // 卡人：别人有，我抢
  return 0.8;                                              // 全新组：随便占一个
}

// 小萌：看心情（用稳定哈希模拟"心情"，同一局内一致）
function scoreXiaomeng(t, player, TILES) {
  if (t.type !== 'property' && t.type !== 'railroad' && t.type !== 'utility') return 0;
  // 用玩家 id + 地价做伪随机，代表"她今天喜欢什么"
  const seed = (player.id * 31 + Math.round((t.price || 0) / 100)) % 7;
  let s = 1.0 + seed * 0.55;            // 1.0 ~ 4.3 随机
  if (t.color) {
    const same = TILES.filter((x) => x.type === 'property' && x.color === t.color);
    const mine = same.filter((x) => x.owner === player.id).length;
    s += mine * 0.8;                    // 还是会凑组，但不如沈毅执着
  }
  return s;
}

const SCORERS = {
  shenyi: scoreShenyi,
  ahao: scoreAhao,
  linda: scoreLinda,
  laozhou: scoreLaozhou,
  xiaomeng: scoreXiaomeng,
};

/**
 * 给某块地打分（保留兼容旧接口）
 */
export function scoreTile(t, player, TILES) {
  if (!t) return -999;
  if (t.type !== 'property' && t.type !== 'railroad' && t.type !== 'utility') {
    if (t.type === 'tax' || t.type === 'gotojail') return -5;
    return 0;
  }
  if (t.owner === player.id) return 0.4;
  if (t.owner != null) return -2;
  const persona = getPersona(player);
  const fn = SCORERS[persona.id] || scoreAhao;
  return fn(t, player, TILES);
}

/**
 * 决定是否买地——每个性格有自己的门槛逻辑
 */
export function shouldBuy(player, tile, TILES) {
  if (!tile || tile.owner != null) return false;
  const persona = getPersona(player);
  const price = tile.price || 0;
  if (!price) return false;

  // 负债绝对不能买（老爹 2026-10-20 定的规则）
  if (player.money < 0) return false;

  // 现金不够留储备 → 不买
  if (player.money < price + persona.buyReserve) return false;

  const s = scoreTile(tile, player, TILES);
  if (s <= 0) return false;

  // 各性格的判定阈值不同
  switch (persona.id) {
    case 'ahao':
      // 阿豪：几乎什么都买，只要分数不是负的
      return s >= 1.0;
    case 'shenyi':
      // 沈毅：同色组优先；新组入场券（1.8+）也买；顶级组(0.8)不碰
      return s >= 1.6;
    case 'laozhou':
      // 老周：卡人分高就买，普通散地也凑合
      return s >= 1.2;
    case 'linda':
      // 琳达：交通/贵地优先
      return s >= 1.5;
    case 'xiaomeng':
      // 小萌：门槛最低（乱买）
      return s >= 0.9;
    default:
      return s >= 1.2;
  }
}

/**
 * 决定是否升级（盖房）——性格差异明显
 */
export function shouldBuild(player, tile, TILES) {
  if (!tile || tile.owner !== player.id) return false;
  if (tile.type !== 'property') return false;
  const lv = tile.houses || 0;
  if (lv >= 5) return false;

  const persona = getPersona(player);
  const cost = tile.houseCost || Math.round((tile.price || 0) * 0.5);

  // 负债状态不能盖房
  if (player.money < 0) return false;

  switch (persona.id) {
    case 'ahao':
      // 阿豪：有钱就盖，几乎不留储备
      return player.money >= cost + 200;
    case 'shenyi':
      // 沈毅：只有凑齐同色组才盖（而且是凑齐后重仓）
      if (TILES) {
        const same = TILES.filter((x) => x.type === 'property' && x.color === tile.color);
        const mine = same.filter((x) => x.owner === player.id).length;
        if (mine < same.length) return false;   // 没凑齐 → 不盖
      }
      return player.money >= cost + persona.buyReserve;
    case 'linda':
      // 琳达：偏爱高价地盖房
      if ((tile.price || 0) < 8000) return false;
      return player.money >= cost + 800;
    case 'laozhou':
      // 老周：只在卡人成功（同组别人有）时盖房，逼别人交高租
      if (TILES) {
        const same = TILES.filter((x) => x.type === 'property' && x.color === tile.color);
        const others = same.filter((x) => x.owner != null && x.owner !== player.id).length;
        if (others === 0) return player.money >= cost + 2500;   // 没卡到人 → 保守
      }
      return player.money >= cost + 1000;
    case 'xiaomeng':
      // 小萌：看心情，随机性大
      return player.money >= cost + (Math.random() < 0.5 ? 300 : 2200);
    default:
      return player.money > cost + persona.buyReserve * 1.3;
  }
}

/**
 * 选一个要升级的地块——各性格偏好不同
 */
export function pickBuildTile(player, TILES) {
  const persona = getPersona(player);
  const owned = [];
  for (let i = 0; i < TILES.length; i++) {
    const t = TILES[i];
    if (t.owner === player.id && t.type === 'property' && (t.houses || 0) < 5) {
      owned.push({ i, lv: t.houses || 0, price: t.price || 0, color: t.color });
    }
  }
  if (!owned.length) return -1;

  switch (persona.id) {
    case 'shenyi': {
      // 沈毅：只盖已凑齐的同色组，先盖等级低的
      const complete = owned.filter((o) => {
        const same = TILES.filter((x) => x.type === 'property' && x.color === o.color);
        return same.every((x) => x.owner === player.id);
      });
      if (!complete.length) return -1;
      complete.sort((a, b) => a.lv - b.lv || b.price - a.price);
      return complete[0].i;
    }
    case 'ahao': {
      // 阿豪：直接盖最贵的、等级最高的（一路推到满）
      owned.sort((a, b) => b.lv - a.lv || b.price - a.price);
      return owned[0].i;
    }
    case 'linda': {
      // 琳达：只盖高价地
      const rich = owned.filter((o) => o.price >= 8000);
      if (!rich.length) return -1;
      rich.sort((a, b) => b.price - a.price);
      return rich[0].i;
    }
    case 'laozhou': {
      // 老周：盖「能卡到人」的组（别人占了同组的地）
      const block = owned.filter((o) => {
        const same = TILES.filter((x) => x.type === 'property' && x.color === o.color);
        return same.some((x) => x.owner != null && x.owner !== player.id);
      });
      const pool = block.length ? block : owned;
      pool.sort((a, b) => b.price - a.price);
      return pool[0].i;
    }
    case 'xiaomeng':
    default: {
      // 小萌：随机挑一个
      return owned[Math.floor(Math.random() * owned.length)].i;
    }
  }
}
