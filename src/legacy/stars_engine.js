/* ============================================================
 * stars_engine.js — 天罡地煞 · 星宿降临引擎
 * 作用：把 108 星宿接进大富翁，踩「机会/命运」或过起点时触发降临
 * 数据：stars_108.json（老爹 2026-10-17 水浒版 + 审查平替）
 * 依赖：无外部库（纯原生 JS，零依赖）
 * 输入：player 数组、turn 当前玩家索引、square 棋盘数据
 * 输出：修改玩家资金/位置/状态，弹出降临弹窗
 *
 * 三条底线（老爹 2026-10-17 定）：
 *   1. 不弹窗选目标 —— 所有"指定对手"改为随机自动选取
 *   2. 不改过路费公式 —— 只在现有逻辑之外加减
 *   3. 不调外部系统 —— 纯前端，零网络请求
 * ============================================================ */

(function(){
  'use strict';

  var STAR_DB = [];          // 108 星数据
  var DB_READY = false;
  var dexMap = {};           // 图鉴：本局收集（只存内存，刷新即清）
  var pendingEffects = [];   // 待生效 buff 队列（按玩家索引存）
  var inStarEvent = false;   // 防止星宿事件重入

  /* ---------- 安全随机（防作弊端只能防到这个程度） ----------
   * crypto.getRandomValues 比 Math.random 难预测，
   * 但代码全在浏览器里，改得了源码。诚实地说：防作弊，防不了改代码。 */
  function secureRand(max){
    max = Math.floor(max);
    if(max <= 0) return 0;
    var buf = new Uint32Array(1);
    if(window.crypto && window.crypto.getRandomValues){
      window.crypto.getRandomValues(buf);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function randRange(min, max){
    return min + secureRand(max - min + 1);
  }

  /* ---------- 加载星宿数据 ---------- */
  function loadStars(cb){
    if(DB_READY){ cb(); return; }
    fetch('stars_108.json')
      .then(function(r){ return r.json(); })
      .then(function(d){
        STAR_DB = d.stars || [];
        DB_READY = true;
        cb();
      })
      .catch(function(err){
        console.warn('[星宿] 数据加载失败', err);
        cb();
      });
  }

  /* ---------- 5 个基础效果函数 ---------- */
  /* 2026-10-18：星宿金额改为「百分比 + 兜底」
   * 实际金额 = max(固定值, 当前现金 × 比例)
   * 前期按固定值走，后期自动跟着资产涨。 */
  var PCT_GAIN = 0.10, PCT_LOSE = 0.05, PCT_OPP = 0.08, PCT_ALL = 0.05;

  function pctAmount(base, p, pct){
    return Math.max(base, Math.round((p && p.money ? p.money : 0) * pct));
  }

  function addMoney(p, amount, cause){
    var amt = pctAmount(amount, p, PCT_GAIN);
    p.money += amt;
    addAlert(p.name + ' 获得 $' + amt + '（' + cause + '）');
  }

  function removeMoney(p, amount, cause){
    var amt = Math.min(pctAmount(amount, p, PCT_LOSE), p.money);
    p.money -= amt;
    addAlert(p.name + ' 失去 $' + amt + '（' + cause + '）');
  }

  function moveSteps(p, steps){
    var N = square.length;
    if(steps > 0){
      // 前进：逐步走，经过起点领工资
      for(var i = 0; i < steps; i++){
        p.position = (p.position + 1) % N;
        if(p.position === 0){
          p.money += 200;
          addAlert(p.name + ' 经过起点，领取 $200。');
        }
      }
    } else {
      // 后退：倒退回起点不退钱
      p.position = (p.position + steps + N * 10) % N;
    }
    updatePosition();
  }

  function skipTurn(p){
    p.starSkip = true;
    addAlert(p.name + ' 本回合跳过掷骰。');
  }

  function changeProperty(p, action, target){
    // 不改核心逻辑，只做建筑层级增减
    var s = target || square[p.position];
    if(!s || s.price === 0) return false;
    if(action === 'upgrade' && s.owner === player.indexOf(p)){
      if(s.house < 4){ s.house++; }
      else if(s.house === 4){ s.hotel = 1; }
      updateOwned();
      return true;
    }
    if(action === 'downgrade'){
      if(s.hotel){ s.hotel = 0; s.house = 4; }
      else if(s.house > 0){ s.house--; }
      updateOwned();
      return true;
    }
    return false;
  }

  /* ---------- 辅助：取对手列表 ---------- */
  function getOpponents(p){
    var list = [];
    // 2026-10-18 修正：排除「抽卡的人 p」而不是全局 turn ——
    // 原写法在 AI 抽卡时会把 AI 自己排除，导致只剩玩家可选（甚至被扣钱）。
    var me = (typeof p === 'object' && p) ? player.indexOf(p) : turn;
    if(me < 1) me = turn;
    for(var i = 1; i <= pcount; i++){
      if(i !== me && player[i] && player[i].money > 0){
        list.push(i);
      }
    }
    return list;
  }

  function randomOpponent(p){
    var ops = getOpponents(p);
    if(!ops.length) return null;
    return ops[secureRand(ops.length)];
  }

  function countUnowned(){
    var n = 0;
    for(var i = 0; i < square.length; i++){
      if(square[i].price > 0 && square[i].owner === 0){ n++; }
    }
    return n;
  }

  function cheapestAvailable(){
    var best = null;
    for(var i = 0; i < square.length; i++){
      var s = square[i];
      if(s.price > 0 && s.owner === 0){
        if(!best || s.price < best.price){ best = s; }
      }
    }
    return best;
  }

  /* ---------- 执行星宿效果（46 种类型） ---------- */
  function applyEffect(star, p){
    var et = star.effect_type;
    var v = star.value;
    var idx = player.indexOf(p);
    var payload = { type: et, value: v, star: star };

    switch(et){
      /* --- 金钱 --- */
      case 'gain':
        addMoney(p, v, star.name);
        break;
      case 'lose':
        removeMoney(p, v, star.name);
        break;
      case 'percent_gain':
        addMoney(p, Math.round(p.money * v / 100), star.name);
        break;
      case 'lose_percent':
        removeMoney(p, Math.round(p.money * v / 100), star.name);
        break;
      case 'heal_percent':
        addMoney(p, Math.round(p.money * v / 100), star.name);
        break;
      case 'random_gain':
        addMoney(p, randRange(100, 400), star.name);
        break;
      case 'random_swing':
        if(secureRand(2) === 0){ addMoney(p, 150, star.name); }
        else { removeMoney(p, 150, star.name); }
        break;

      /* --- 对对手 --- */
      case 'all_lose':
        var ops = getOpponents(p);
        for(var i = 0; i < ops.length; i++){
          var oal = player[ops[i]];
          var amtAll = Math.min(Math.max(v, Math.round(oal.money * PCT_ALL)), oal.money);
          oal.money -= amtAll;
          addAlert(oal.name + ' 失去 $' + amtAll + '（' + star.name + '）');
        }
        break;
      case 'collect_all':
        var ops2 = getOpponents(p);
        for(var j = 0; j < ops2.length; j++){
          var o = player[ops2[j]];
          var take = Math.min(v, o.money);
          o.money -= take;
          p.money += take;
        }
        addAlert(p.name + ' 从全场收得钱款。');
        break;
      case 'collect_one':
        var t1 = randomOpponent(p);
        if(t1 !== null){
          var op1 = player[t1];
          var take1 = Math.min(Math.max(v, Math.round(op1.money * PCT_OPP)), op1.money);
          op1.money -= take1;
          p.money += take1;
        }
        break;
      case 'collect_percent':
        var t2 = randomOpponent(p);
        if(t2 !== null){
          var op2 = player[t2];
          var take2 = Math.round(op2.money * v / 100);
          op2.money -= take2;
          p.money += take2;
        }
        break;
      case 'steal_percent':
        var t3 = randomOpponent(p);
        if(t3 !== null){
          var op3 = player[t3];
          var take3 = Math.round(op3.money * v / 100);
          op3.money -= take3;
          p.money += take3;
        }
        break;

      /* --- 移动 --- */
      case 'move':
        moveSteps(p, v);
        break;
      case 'random_move':
        moveSteps(p, randRange(1, 6));
        break;
      case 'random_move_pm':
        var steps = randRange(3, 6);
        if(secureRand(2) === 0){ steps = -steps; }
        moveSteps(p, steps);
        break;
      case 'teleport':
        // 传送到随机一处地标（非特殊格）
        var candidates = [];
        for(var k = 0; k < square.length; k++){
          if(square[k].price > 0 && square[k].owner === 0){ candidates.push(k); }
        }
        if(candidates.length){
          p.position = candidates[secureRand(candidates.length)];
          updatePosition();
        }
        break;

      /* --- 状态 --- */
      case 'extra_roll':
        p.starExtraRoll = true;
        break;
      case 'double_dice':
        p.starDoubleDice = true;
        break;
      case 'free_rent':
        p.starFreeRent = (p.starFreeRent || 0) + v;
        break;
      case 'shield':
        p.starShield = (p.starShield || 0) + 1;
        break;
      case 'isolate':
        p.starIsolate = 1;
        break;
      case 'skip_turn':
        skipTurn(p);
        break;
      case 'goto_jail':
        gotojail();
        break;
      case 'jail_card':
        p.starJailCard = (p.starJailCard || 0) + 1;
        break;
      case 'mortgage_freeze':
        // 随机冻结一块对手地皮
        var ft = randomOpponent(p);
        if(ft !== null){
          var fpos = player[ft].position;
          if(square[fpos] && square[fpos].price > 0){
            square[fpos].starFrozen = v;
          }
        }
        break;

      /* --- 限制对手 --- */
      case 'limit_move':
        var lt = randomOpponent(p);
        if(lt !== null){ player[lt].starLimitMove = v; }
        break;
      case 'jail_one':
        var jt = randomOpponent(p);
        if(jt !== null){
          player[jt].jail = true;
          player[jt].jailroll = 0;
        }
        break;
      case 'jail_random':
        var jr = randomOpponent(p);
        if(jr !== null){
          player[jr].jail = true;
          player[jr].jailroll = 0;
        }
        break;
      case 'jail_companion':
        p.starJailCompanion = 1;
        break;
      case 'mutual_debuff':
        p.starLimitMove = 1;
        var mt = randomOpponent(p);
        if(mt !== null){ player[mt].starLimitMove = 1; }
        break;

      /* --- 资产 --- */
      case 'fill_money':
        var cheap = cheapestAvailable();
        if(cheap && p.money < cheap.price){
          p.money = cheap.price;
        }
        break;
      case 'comeback':
        if(p.money < 1000){ addMoney(p, 500, '救济金'); }
        break;
      case 'per_unowned':
        addMoney(p, countUnowned() * 100, star.name);
        break;
      case 'balance':
        var total = 0, cnt = 0;
        for(var b = 1; b <= pcount; b++){ total += player[b].money; cnt++; }
        var avg = Math.round(total / cnt);
        for(var c = 1; c <= pcount; c++){ player[c].money = avg; }
        break;

      /* --- 特殊（老爹审查平替） --- */
      case 'grant_toll_pass':
        p.starFreeRent = (p.starFreeRent || 0) + 1;
        break;
      case 'disarm':
        var dos = getOpponents(p);
        for(var d = 0; d < dos.length; d++){
          var dp = player[dos[d]];
          if(dp.starJailCard){ dp.starJailCard--; }
          else if(dp.starFreeRent){ dp.starFreeRent--; }
          else { dp.money -= Math.round(dp.money * 0.1); }
        }
        break;
      case 'free_upgrade_or_cash':
        var myProps = [];
        for(var m = 0; m < square.length; m++){
          if(square[m].owner === idx + 1 && square[m].price > 0){ myProps.push(square[m]); }
        }
        if(myProps.length){
          var target = myProps[secureRand(myProps.length)];
          if(target.house < 4){ target.house++; }
          else if(target.house === 4 && !target.hotel){ target.hotel = 1; }
          updateOwned();
        } else {
          addMoney(p, 300, star.name);
        }
        break;
      case 'downgrade':
        var dops = getOpponents(p);
        var dtargets = [];
        for(var n2 = 0; n2 < dops.length; n2++){
          var dpos = player[dops[n2]].position;
          if(square[dpos] && square[dpos].owner === dops[n2] + 1 && square[dpos].house > 0){
            dtargets.push(square[dpos]);
          }
        }
        if(dtargets.length){
          var dt = dtargets[secureRand(dtargets.length)];
          if(dt.hotel){ dt.hotel = 0; dt.house = 4; }
          else { dt.house--; }
          updateOwned();
        }
        break;
      case 'steal_property':
        var sprops = [];
        for(var q1 = 0; q1 < square.length; q1++){
          var sq1 = square[q1];
          if(sq1.owner > 0 && sq1.owner !== idx + 1 && sq1.price > 0 && sq1.house === 0 && !sq1.hotel){
            sprops.push(sq1);
          }
        }
        if(sprops.length){
          var sp = sprops[secureRand(sprops.length)];
          sp.owner = idx + 1;
          updateOwned();
        }
        break;
      case 'demolish':
        var deops = getOpponents(p);
        var dtargets2 = [];
        for(var q2 = 0; q2 < square.length; q2++){
          var sq2 = square[q2];
          if(sq2.owner > 0 && sq2.owner !== idx + 1 && (sq2.house > 0 || sq2.hotel)){
            dtargets2.push(sq2);
          }
        }
        if(dtargets2.length){
          var dm = dtargets2[secureRand(dtargets2.length)];
          dm.house = 0; dm.hotel = 0;
          updateOwned();
        }
        break;

      /* --- 防御类 --- */
      case 'cleanse':
        p.starIsolate = 0;
        p.starLimitMove = 0;
        p.starShield = 0;
        p.starJailCard = (p.starJailCard || 0) + 1;
        break;
      case 'reflect':
        p.starReflect = 1;
        break;
      case 'bankrupt_shield':
      case 'bankrupt_save':
        p.starBankruptShield = v;
        break;
      case 'force_buy':
        // 强制买下当前地标（原价 +20%）
        var cur = square[p.position];
        if(cur && cur.price > 0 && cur.owner !== idx + 1){
          var cost = Math.round(cur.price * (1 + v / 100));
          if(p.money >= cost){
            p.money -= cost;
            if(cur.owner > 0){ player[cur.owner].money += cost; }
            cur.owner = idx + 1;
            updateOwned();
          }
        }
        break;
      case 'duel':
        var du = randomOpponent(p);
        if(du !== null){
          var a = randRange(1, 6), b2 = randRange(1, 6);
          if(a >= b2){
            var loot = Math.round(player[du].money * v / 100);
            player[du].money -= loot;
            p.money += loot;
          } else {
            var loot2 = Math.round(p.money * v / 100);
            p.money -= loot2;
            player[du].money += loot2;
          }
        }
        break;
      case 'bank_pay':
        p.starFreeRent = (p.starFreeRent || 0) + 1;
        break;
      case 'half_price':
        p.starHalfPrice = 1;
        break;
      case 'free_upgrade':
        var fus = [];
        for(var f = 0; f < square.length; f++){
          if(square[f].owner === idx + 1 && square[f].price > 0 && square[f].house < 4){
            fus.push(square[f]);
          }
        }
        if(fus.length){
          var fu = fus[secureRand(fus.length)];
          fu.house++;
          updateOwned();
        }
        break;

      default:
        addAlert('（' + star.name + ' 效果未实现：' + et + '）');
        break;
    }

    updateMoney();
    return payload;
  }

  /* ---------- 抽星：天罡格出天罡，地煞格出地煞 ---------- */
  function drawStar(kind, p){
    var pool = [];
    for(var i = 0; i < STAR_DB.length; i++){
      if(STAR_DB[i].type === kind){ pool.push(STAR_DB[i]); }
    }
    // 2026-10-18 老爹定：天罡三星后「别人绝版、自己不绝版」→ 按玩家过滤
    // 地煞不受此限（canDrawFor 内部只对天罡三星生效，地煞无三星绝版）
    if(p && window.CNStars && window.CNStars.canDrawFor){
      var filtered = [];
      for(var j = 0; j < pool.length; j++){
        if(window.CNStars.canDrawFor(p, pool[j].name)) filtered.push(pool[j]);
      }
      if(filtered.length) pool = filtered;   // 兜底：全被过滤就保留原池，避免抽空
    }
    if(!pool.length) return null;
    return pool[secureRand(pool.length)];
  }

  /* ---------- 图鉴（本局收集，只存内存） ---------- */
  function recordDex(star){
    var key = star.name;
    dexMap[key] = (dexMap[key] || 0) + 1;
  }

  function getDexCount(){ return Object.keys(dexMap).length; }

  /* ---------- 星宿降临弹窗（黑金风） ---------- */
  function showStarPopup(star, p, after){
    var isGang = star.type === 'gang';
    var accent = isGang ? '#ffd86a' : '#ff6b8a';
    var dim = isGang ? '#8a7040' : '#5a2a38';
    var icon = isGang ? '🌟' : '🌑';
    var label = isGang ? '天罡降临' : '地煞降临';
    var serial = (isGang ? '天罡第 ' : '地煞第 ') + star.idx + (isGang ? ' / 36' : ' / 72');

    var html =
      '<div style="padding:18px 18px 12px;text-align:center">' +
        '<div style="font-size:11px;letter-spacing:4px;color:' + accent + ';opacity:.75;margin-bottom:10px">' + label + '</div>' +
        '<div style="font-size:32px;line-height:1;margin-bottom:8px">' + icon + '</div>' +
        '<div style="font-size:24px;font-weight:900;color:' + accent + ';letter-spacing:3px;text-shadow:0 0 18px ' + accent + '55">' + star.name + '</div>' +
        '<div style="font-size:11px;color:' + dim + ';margin-top:5px;letter-spacing:1px">' + (star.person ? star.person + ' · ' : '') + star.title + '</div>' +
        '<div style="height:1px;background:linear-gradient(90deg,transparent,' + accent + '66,transparent);margin:14px 0 12px"></div>' +
        '<div style="font-size:14px;color:#e8dcc8;line-height:1.8;padding:0 2px">' + star.text + '</div>' +
        '<div style="margin-top:16px;font-size:10px;color:#5a4a3a;letter-spacing:1px">' + serial + '</div>' +
        '<div style="margin-top:6px;font-size:10px;color:#4a3a2a">' + p.name + ' · 本局已遇 ' + getDexCount() + ' / 108</div>' +
      '</div>' +
      '<button class="star-btn" id="starbtn">收 下</button>';

    document.getElementById('popuptext').innerHTML = html;

    var el = document.getElementById('popup');
    el.className = 'star-popup' + (isGang ? '' : ' di');
    el.style.width = '300px';
    el.style.minWidth = '300px';
    el.style.padding = '0';
    el.style.top = '0px';
    el.style.left = '0px';

    var wrap = document.getElementById('popupwrap');
    var bg = document.getElementById('popupbackground');
    if(bg) bg.style.display = 'block';
    wrap.style.display = 'block';
    wrap.style.top = '50%';
    wrap.style.transform = 'translateY(-50%)';
    wrap.style.position = 'fixed';

    var btn = document.getElementById('starbtn');
    function close(){
      if(bg) bg.style.display = 'none';
      wrap.style.display = 'none';
      el.className = '';
      if(after) after();
    }
    btn.addEventListener('click', close);
    btn.addEventListener('touchend', function(e){ e.preventDefault(); close(); });
  }

  /* ---------- 触发入口 ---------- */
  function triggerStarEvent(kind, p, after){
    if(inStarEvent){ if(after) after(); return; }
    inStarEvent = true;

    loadStars(function(){
      var star = drawStar(kind, p);
      if(!star){ inStarEvent = false; if(after) after(); return; }
      recordDex(star);
      applyEffect(star, p);
      showStarPopup(star, p, function(){
        inStarEvent = false;
        if(after) after();
      });
    });
  }

  /* ---------- 暴露给主逻辑 ---------- */
  window.StarEngine = {
    trigger: triggerStarEvent,
    drawStar: drawStar,
    getDex: function(){ return dexMap; },
    getDexCount: getDexCount,
    applyEffect: applyEffect,
    stars: function(){ return STAR_DB; },
    isReady: function(){ return DB_READY; },
    load: loadStars
  };

})();
