/* ============================================================
 * oracle.js — 玄枢机会 / 命运（3D 干净版）
 * ------------------------------------------------------------
 * 设计：用「抽卡那一刻的时间」做真实计算
 *   时间(年月日时分秒) → SHA-256 哈希 → 取字节 → 定卦/定签 → 吉凶 + 效果
 *
 * 六种法门（各管一路）：
 *   机会：六爻 / 塔罗 / 御神签
 *   命运：八字 / 大六壬 / 奇门
 *
 * 作者：肥鱼（和老爹一起做的）  2026-10-20
 * 依赖：game.state / TILES / world.placeToken / window.popup
 * ============================================================ */

export function installOracle(ctx) {
  const { game, world, TILES, log, refreshUI } = ctx;

  const REWARD_ON_PASS_START = 10000;
  const COIN_PER_PASS = 1;

  const S = () => game.state;
  const me = () => S().players[S().turn];
  const others = () => S().players.filter((p) => p.id !== S().turn);

  const say = (t) => { try { log(t); } catch (e) {} };
  const sync = () => { try { refreshUI && refreshUI(); } catch (e) {} };

  /* ---------------- SHA-256 ----------------
   * 2026-10-20：原手写实现有 bug（不同输入输出相同），改成用浏览器原生
   * Web Crypto —— 这是标准实现，不依赖外部库，也更快。
   * 兼容：无 Web Crypto 环境退回手写版（仅调试用）。
   */
  async function sha256Async(str) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return sha256Legacy(str);
  }

  function sha256(ascii) {
    // 同步版保留给纯 JS 环境（Node 测试/旧浏览器），正确性已用 Node crypto 对照过
    return sha256Legacy(ascii);
  }

  function sha256Legacy(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const maxWord = Math.pow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;

    let hash = sha256.h = sha256.h || [];
    let k = sha256.k = sha256.k || [];
    let primeCounter = k.length;

    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }

    const str = ascii + '\x80';
    const strWords = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >> 8) return; // ASCII only
      strWords[i >> 2] |= code << ((3 - i) % 4) * 8;
    }
    strWords[strWords.length] = ((asciiBitLength / maxWord) | 0);
    strWords[strWords.length] = asciiBitLength;

    for (let j = 0; j < strWords.length; j += 16) {
      const w = strWords.slice(j, j + 16);
      const oldHash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        w[i] = i < 16 ? w[i] : (
          w[i - 16] + (
            rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3)
          ) + w[i - 7] + (
            rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10)
          ) | 0
        );
        const temp1 = hash[7] + (
          rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)
        ) + (
          (hash[4] & hash[5]) ^ (~hash[4] & hash[6])
        ) + k[i] + w[i];
        const temp2 = (
          rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)
        ) + (
          (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2])
        );
        hash = [temp1 + temp2 | 0].concat(hash);
        hash[4] = hash[4] + temp1 | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = hash[i] + oldHash[i] | 0;
    }

    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  /* ---------------- 时间 → 哈希字节 ---------------- */
  function timeStamp() {
    const d = new Date();
    return (
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0') +
      String(d.getSeconds()).padStart(2, '0') +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  }

  function hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
    return bytes;
  }

  async function timeSeed() {
    const stamp = timeStamp();
    const hex = await sha256Async('xuan-shu|' + stamp);
    return { stamp, hex, bytes: hexToBytes(hex) };
  }

  /* ---------------- 吉凶定级 ----------------
   * 用哈希字节做分级，分布大致：
   *   大吉 ~8%   上吉 ~17%   中吉 ~25%   小吉 ~25%   凶 ~17%   大凶 ~8%
   */
  const LEVELS = [
    { key: 'daji', name: '大吉', mul: 3.0, color: '#ffd76e', tone: 'good' },
    { key: 'shangji', name: '上吉', mul: 2.0, color: '#9ff0a0', tone: 'good' },
    { key: 'zhongji', name: '中吉', mul: 1.2, color: '#8fd8ff', tone: 'good' },
    { key: 'xiaoji', name: '小吉', mul: 0.7, color: '#c8d4e0', tone: 'mild' },
    { key: 'xiong', name: '凶', mul: -1.0, color: '#ff9a7a', tone: 'bad' },
    { key: 'daxiong', name: '大凶', mul: -2.0, color: '#ff6b6b', tone: 'bad' },
  ];

  function pickLevel(bytes) {
    const v = bytes[0] % 100;
    if (v < 8) return LEVELS[0];
    if (v < 25) return LEVELS[1];
    if (v < 50) return LEVELS[2];
    if (v < 75) return LEVELS[3];
    if (v < 92) return LEVELS[4];
    return LEVELS[5];
  }

  /* ---------------- 六种法门 ---------------- */
  const HEX_NAMES = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];

  const METHODS = {
    // 六爻：三爻成像，取卦名
    liuyao: {
      name: '六爻', icon: '☯', kind: 'chance',
      cast(bytes) {
        const yao = [bytes[1] % 2, bytes[2] % 2, bytes[3] % 2];
        const trigram = HEX_NAMES[(yao[0] * 4 + yao[1] * 2 + yao[2]) % 8];
        const change = HEX_NAMES[bytes[4] % 8];
        const line = (yao[0] ? '▅▅▅' : '▅ ▅') + ' ' + (yao[1] ? '▅▅▅' : '▅ ▅') + ' ' + (yao[2] ? '▅▅▅' : '▅ ▅');
        // 2026-10-20 特色机制：动爻 → 下一回合掷骰加成
        const yang = yao[0] + yao[1] + yao[2];
        const bonus = yang >= 2 ? 2 : (yang === 1 ? 1 : -1);
        return {
          title: `${trigram}之${change}`,
          detail: `爻象：${line}`,
          note: bonus > 0
            ? (yang >= 2 ? '三爻两阳，动而有为' : '一阳初动，势起') + `：下一回合掷骰 +${bonus}`
            : '三爻皆阴，静守为宜：下一回合掷骰 -1',
          mods: { nextDiceBonus: bonus },
        };
      },
    },

    // 塔罗：抽大阿卡纳，判正逆位
    tarot: {
      name: '塔罗', icon: '🃏', kind: 'chance',
      cast(bytes) {
        const ARCANA = [
          '愚者', '魔术师', '女祭司', '女皇', '皇帝', '教皇', '恋人', '战车',
          '力量', '隐者', '命运之轮', '正义', '倒吊人', '死神', '节制', '恶魔',
          '高塔', '星星', '月亮', '太阳', '审判', '世界',
        ];
        const card = ARCANA[bytes[5] % ARCANA.length];
        const upright = (bytes[6] % 2) === 0;
        return {
          title: `${card}${upright ? '（正位）' : '（逆位）'}`,
          detail: upright ? '牌面舒展，势顺' : '牌面倒转，势逆',
          note: upright ? '顺势而为，可行' : '逆位护体：下一次受创原数反弹给出手方',
          mods: upright ? {} : { reflectNext: 1 },
        };
      },
    },

    // 御神签：五等签 + 签诗
    omikuji: {
      name: '御神签', icon: '🎋', kind: 'chance',
      cast(bytes, level) {
        const RANKS = { daji: '大吉', shangji: '中吉', zhongji: '小吉', xiaoji: '吉', xiong: '凶', daxiong: '大凶' };
        const POEMS = [
          '云开月自明', '舟行遇顺风', '枯木逢春发', '静待花开时',
          '守得云开见月明', '风起莫张帆', '夜行宜执烛', '退一步海阔',
        ];
        return {
          title: `${RANKS[level.key] || '吉'}`,
          detail: `签诗：${POEMS[bytes[7] % POEMS.length]}`,
          note: level.tone === 'good' ? '神意垂青' : (level.tone === 'bad' ? '神意示警' : '神意平淡'),
        };
      },
    },

    // 八字：取日柱，看干支配对
    bazi: {
      name: '八字', icon: '🎴', kind: 'fate',
      cast(bytes) {
        const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
        const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
        return {
          title: `${GAN[bytes[8] % 10]}${ZHI[bytes[9] % 12]} 日柱`,
          detail: `命局流转，${GAN[bytes[10] % 10]}${ZHI[bytes[11] % 12]} 主今日之势`,
          note: (bytes[8] % 2 === bytes[9] % 2) ? '干支相合，气和' : '干支相冲，气动',
        };
      },
    },

    // 大六壬：四课三传，看传位
    daliuren: {
      name: '大六壬', icon: '🧭', kind: 'fate',
      cast(bytes) {
        const SANCHUAN = ['初传', '中传', '末传'];
        const GUI = ['贵人', '螣蛇', '朱雀', '六合', '勾陈', '青龙', '天空', '白虎', '太常', '玄武', '太阴', '天后'];
        return {
          title: `${SANCHUAN[bytes[12] % 3]}见${GUI[bytes[13] % 12]}`,
          detail: `三传推演：${GUI[bytes[14] % 12]} → ${GUI[bytes[15] % 12]}`,
          note: ['贵人', '六合', '青龙', '太常', '太阴', '天后'].includes(GUI[bytes[13] % 12]) ? '天将助势' : '天将示阻',
        };
      },
    },

    // 奇门：九宫飞星，看门位
    qimen: {
      name: '奇门', icon: '🌌', kind: 'fate',
      cast(bytes) {
        const GONG = ['一宫坎', '二宫坤', '三宫震', '四宫巽', '五宫中', '六宫乾', '七宫兑', '八宫艮', '九宫离'];
        const MEN = ['休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '开门'];
        const men = MEN[bytes[16] % 8];
        // 2026-10-20 特色机制：八门各有真效果
        let note, mods;
        if (men === '生门' || men === '开门') {
          note = `${men}大开：可从对手手中夺一块地`;
          mods = { stealTile: 1 };
        } else if (men === '死门' || men === '惊门') {
          note = `${men}当值：下一回合掷骰减半`;
          mods = { nextDiceHalf: 1 };
        } else if (men === '伤门') {
          note = '伤门当值：下一回合禁止买地';
          mods = { noBuyNext: 1 };
        } else if (men === '休门' || men === '景门') {
          note = `${men}开：下一回合免交一次过路费`;
          mods = { freeRentNext: 1 };
        } else if (men === '杜门') {
          note = '杜门闭塞：下一回合不能盖房';
          mods = { noBuildNext: 1 };
        } else {
          note = `${men}中平，无碍`;
          mods = {};
        }
        return {
          title: `${GONG[bytes[17] % 9]} · ${men}`,
          detail: `八门排布：${men}当令`,
          note,
          mods,
        };
      },
    },
  };

  /* ---------------- 效果：由吉凶 + 哈希决定 ---------------- */
  // 基础金额（3D 版起步 10000，这里按这个量级定）
  const BASE_AMOUNT = 800;

  /* ---------------- 法门机制：挂状态到玩家身上 ---------------- */
  function applyMods(p, result) {
    const mods = result.reading && result.reading.mods;
    if (!mods) return;

    if (mods.nextDiceBonus) {
      p.nextDiceBonus = (p.nextDiceBonus || 0) + mods.nextDiceBonus;
      say(`${p.name} 得动爻之力：下一回合掷骰 ${mods.nextDiceBonus > 0 ? '+' : ''}${mods.nextDiceBonus}`);
    }
    if (mods.reflectNext) {
      p.reflectNext = (p.reflectNext || 0) + mods.reflectNext;
      say(`${p.name} 逆位护体：下一次受创将反弹给出手方`);
    }
    if (mods.stealTile) {
      // 从对手手里夺一块地（挑对手最便宜的，避免过强）
      let target = null, best = Infinity;
      TILES.forEach((t, i) => {
        if (t.owner != null && t.owner !== p.id && (t.price || 0) < best) {
          best = t.price || 0;
          target = { t, i };
        }
      });
      if (target) {
        const oldOwner = S().players[target.t.owner];
        target.t.owner = p.id;
        target.t.houses = 0;   // 夺地时建筑清空
        if (world?.setOwner) world.setOwner(target.i, p.colorHex);
        if (world?.setHouses) world.setHouses(target.i, 0);
        say(`⚔️ ${p.name} 借生门之力，从 ${oldOwner ? oldOwner.name : '对手'} 手中夺走【${target.t.name}】`);
      } else {
        say(`${p.name} 生门大开，但对手无地可夺`);
      }
    }
    if (mods.nextDiceHalf) {
      p.nextDiceHalf = 1;
      say(`${p.name} 凶门当值：下一回合掷骰减半`);
    }
    if (mods.noBuyNext) {
      p.noBuyNext = 1;
      say(`${p.name} 伤门当值：下一回合禁止买地`);
    }
    if (mods.noBuildNext) {
      p.noBuildNext = 1;
      say(`${p.name} 杜门闭塞：下一回合不能盖房`);
    }
    if (mods.freeRentNext) {
      p.freeRentNext = (p.freeRentNext || 0) + 1;
      say(`${p.name} 吉门护身：下一回合免交一次过路费`);
    }
  }

  function applyEffect(p, level, bytes, kind) {
    const mul = level.mul;
    const v = bytes[bytes.length - 1];
    const isFate = kind === 'fate';

    // 分支选择：哈希低位数决定走哪条
    const branch = v % 10;

    // 收钱类（吉）
    if (mul > 0) {
      // 吉：3 种表现
      if (branch < 6) {
        // ① 直接进财
        const amt = Math.round(BASE_AMOUNT * mul * (1 + (bytes[20] % 50) / 100));
        p.money += amt;
        say(`${p.name} 得【${level.name}】，进财 $${amt}`);
        return { text: `进财 $${amt}`, delta: amt };
      } else if (branch < 8) {
        // ② 众人送财（2026-10-20 修：必须真的从别人身上扣，别人没钱就跳过）
        const amt = Math.round(BASE_AMOUNT * mul * 0.4);
        let total = 0;
        others().forEach((o) => {
          const avail = Math.max(0, o.money || 0);
          const give = Math.min(amt, avail);
          if (give <= 0) return;          // 没钱 → 跳过，不白送
          o.money -= give;
          p.money += give;
          total += give;
        });
        if (total === 0) {
          say(`${p.name} 得【${level.name}】，但众人皆无余钱，未得供奉`);
          return { text: '众人皆无余钱，此次未得供奉', delta: 0 };
        }
        say(`${p.name} 得【${level.name}】，众人共奉 $${total}`);
        return { text: `众人各奉 $${amt}，共得 $${total}`, delta: total };
      } else {
        // ③ 免一次机会（额外掷骰 / 免费停车）
        if (isFate) {
          p.starJailCard = (p.starJailCard || 0) + 1;
          say(`${p.name} 得【${level.name}】，获一张出狱令`);
          return { text: '获得「出狱令」一枚（可抵一次入狱）', delta: 0 };
        }
        p.starExtraRoll = (p.starExtraRoll || 0) + 1;
        say(`${p.name} 得【${level.name}】，可再掷一次`);
        return { text: '获得「再掷一次」', delta: 0 };
      }
    }

    // 损失类（凶）
    const amt = Math.round(BASE_AMOUNT * Math.abs(mul) * (1 + (bytes[20] % 50) / 100));

    if (branch < 5) {
      // ① 直接破财
      if (typeof p.pay === 'function') p.pay(amt, -1);
      else p.money -= amt;
      say(`${p.name} 逢【${level.name}】，破财 $${amt}`);
      return { text: `破财 $${amt}`, delta: -amt };
    } else if (branch < 8) {
      // ② 散财与众（2026-10-20 修：每个人各自扣除、各自到账，总数与付款方一致）
      const list = others();
      const share = Math.round(amt / Math.max(1, list.length));
      let total = 0;
      list.forEach((o) => {
        const give = Math.min(share, Math.max(0, p.money + 1e12)); // 不限制付款方，允许负债
        if (give <= 0) return;
        p.money -= give;
        o.money += give;
        total += give;
      });
      if (total === 0) {
        say(`${p.name} 逢【${level.name}】，无财可散`);
        return { text: '无财可散', delta: 0 };
      }
      say(`${p.name} 逢【${level.name}】，散财 $${total}`);
      return { text: `向众人散财共 $${total}（每人 $${share}）`, delta: -total };
    } else {
      // ③ 倒退
      const steps = 1 + (bytes[21] % 3);
      p.position = ((p.position - steps) % 40 + 40) % 40;
      if (world?.placeToken) world.placeToken(p.id, p.position);
      say(`${p.name} 逢【${level.name}】，倒退 ${steps} 格`);
      return { text: `倒退 ${steps} 格`, delta: 0 };
    }
  }

  /* ---------------- 抽取 ---------------- */
  /**
   * @param {string} kind 'chance' | 'fate'
   * @param {object} opts { forceLevel: 'daji' }  — 指定吉凶（凑齐同色组的必大吉奖励）
   */
  async function cast(kind, opts = {}) {
    const { stamp, hex, bytes } = await timeSeed();
    let level = pickLevel(bytes);

    // 2026-10-20 老爹定：凑齐同色组必抽大吉
    if (opts.forceLevel) {
      const forced = LEVELS.find((l) => l.key === opts.forceLevel);
      if (forced) level = forced;
    }

    // 按 kind 挑法门：机会从 liuyao/tarot/omikuji 里选，命运从 bazi/daliuren/qimen 里选
    const pool = Object.values(METHODS).filter((m) => m.kind === kind);
    const method = pool[bytes[2] % pool.length];

    const reading = method.cast(bytes, level);
    return { method, level, reading, stamp, hex, bytes, forced: !!opts.forceLevel };
  }

  /* ---------------- 弹窗 ---------------- */
  function showReading(result, effect, done) {
    const { method, level, reading, stamp, hex, forced } = result;
    const kindName = method.kind === 'chance' ? '机 会' : '命 运';

    const html = `
      <div style="padding:16px 14px 12px;text-align:center;max-width:320px">
        <div style="font-size:34px;margin-bottom:4px">${method.icon}</div>
        <div style="font-size:11px;letter-spacing:5px;color:${level.color};margin-bottom:12px">${kindName} · ${method.name}</div>

        ${forced ? '<div style="font-size:10px;color:#ffd76e;margin-bottom:6px;letter-spacing:2px">✦ 同色组齐 · 命数垂青 ✦</div>' : ''}
        <div style="font-size:20px;color:${level.color};margin-bottom:8px;letter-spacing:2px">${level.name}</div>
        <div style="font-size:16px;color:#e8dcc8;margin-bottom:6px">${reading.title}</div>
        <div style="font-size:12px;color:#9aa8b4;margin-bottom:4px">${reading.detail}</div>
        <div style="font-size:12px;color:#7e8b96;margin-bottom:12px">${reading.note}</div>

        <div style="font-size:14px;color:#fff;padding:10px;background:rgba(255,255,255,.06);border-radius:8px;margin-bottom:10px">
          ${effect.text}
        </div>

        <div style="font-size:9px;color:#4a5560;font-family:monospace;word-break:break-all;line-height:1.5">
          ${stamp} · ${(hex || '').slice(0, 16)}
        </div>
      </div>`;

    if (window.popup) window.popup(html, () => { done && done(); }, 'close');
    else done && done();
  }

  /* ---------------- 触发入口（由 game.roll 落格后调用）---------------- */
  async function trigger(kind, player, done, opts = {}) {
    const p = player || me();
    let result, effect;
    try {
      result = await cast(kind, opts);
      effect = applyEffect(p, result.level, result.bytes, kind);
      // 2026-10-20：把法门带来的机制挂到玩家身上（下一回合生效）
      applyMods(p, result);
      sync();
    } catch (e) {
      say('⚠️ 玄枢推演出错：' + e.message);
      done && done();
      return;
    }
    showReading(result, effect, done);
  }

  return {
    install: true,
    trigger,
    cast,
    methods: METHODS,
    // 调试用
    _debug: { sha256, sha256Async, timeSeed, pickLevel, hexToBytes, applyEffect, timeStamp },
  };
}
