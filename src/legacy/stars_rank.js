/* ============================================================
 * stars_rank.js — 神明卡升星 + 白饭核弹终局
 * 2026-10-18
 * 规则：
 *   同名 3 张 → 二星；共 9 张 → 三星
 *   星级越高，效果越强（一星 ×1 / 二星 ×2 / 三星 ×4）
 *   集齐 5 张三星 → 白饭核弹，立即第一名，结束本局
 * ============================================================ */
(function(){
  'use strict';

  /* 星级倍率（2026-10-18 老爹定）
   *   地煞星宿：三星 ×8
   *   天罡星宿 / 武将卡 / 神明卡：三星 ×10
   *   四星（彩蛋）：在各自三星基础上再放大 3 倍 */
  var STAR_UP = { 1:1, 2:2, 3:10, 4:30 };      // 默认（天罡/武将/神明）
  var STAR_UP_DI = { 1:1, 2:2, 3:8, 4:24 };     // 地煞专用

  function starMultOf(card, kind){
    var isDi = (kind === 'di') || (card && card.type === 'di');
    return isDi ? STAR_UP_DI : STAR_UP;
  }
  var NEED_2 = 3, NEED_3 = 9, NEED_4 = 27;   // 升星张数（3→9→27）
  var WIN_3STAR = 5;                          // 五张三星触发
  var decks = {};                             // decks[玩家序号][卡名] = 累计抽到张数
  var retired = {};                           // 已升到三星、彻底绝版的卡（全服共享，旧口径，保留兼容）
  // 2026-10-18 老爹定：三星后「别人绝版、自己不绝版」→ 按玩家记录
  //   retiredBy[玩家序号][卡名] = true  → 该卡从【其他玩家】的抽取池里移除
  var retiredBy = {};
  var GAME_LOCKED = false;                    // 白饭核弹触发后锁死一切

  function deckOf(p){
    var i = player.indexOf(p);
    if(i < 1) i = 0;
    if(!decks[i]) decks[i] = {};
    return decks[i];
  }

  function starOf(count){
    if(count >= NEED_4) return 4;
    if(count >= NEED_3) return 3;
    if(count >= NEED_2) return 2;
    return 1;
  }

  function threeStarCount(p){
    var d = deckOf(p), n = 0;
    for(var k in d){ if(d[k] >= NEED_3) n++; }
    return n;
  }

  /* 2026-10-18：对手情报——统计某玩家各星级的卡牌数量 */
  function starStats(p){
    var d = deckOf(p), n1=0, n2=0, n3=0, n4=0, list2=[], list3=[], list4=[];
    for(var k in d){
      var c = d[k] || 0;
      var st = starOf(c);
      if(st >= 4){ n4++; list4.push(k); }
      else if(st === 3){ n3++; list3.push(k); }
      else if(st === 2){ n2++; list2.push(k); }
      else if(c > 0){ n1++; }
    }
    return { one:n1, two:n2, three:n3, four:n4, listTwo:list2, listThree:list3, listFour:list4 };
  }

  /* 抽到一张神明卡：累计 → 算星级 → 按星级放大效果 */
  function drawAndApply(p, card, kind){
    var d = deckOf(p);
    var name = card.name;
    d[name] = (d[name] || 0) + 1;
    var cnt = d[name];
    var star = starOf(cnt);
    var table = starMultOf(card, kind);
    var mult = table[star];

    // 效果按星级放大：把 fn 里的金额放大，通过临时乘数实现
    window.__STAR_MULT = mult;
    try {
      if(typeof card.fn === 'function'){
        // 武将卡 / 神明卡 / 机制卡
        card.fn(p);
      } else if(window.StarEngine && window.StarEngine.applyEffect){
        // 星宿（天罡 / 地煞）——走引擎原效果
        window.StarEngine.applyEffect(card, p);
      }
    } catch(e){ console.warn('[升星]', e); }
    window.__STAR_MULT = 1;

    // 2026-10-18：宝光流转（赐福）——百分比扣钱类卡有 30% 概率暴击，效果再翻倍
    if(window.Boon && window.Boon.onPercentCard && card && card.text && card.text.indexOf('%') >= 0){
      window.Boon.onPercentCard(p, card);
    }

    // 2026-10-18：三星额外触发专属技能（原效果 ×10 之后再叠加）
    if(cnt === NEED_3){
      // 武将/神明：卡自带 star3fn
      if(typeof card.star3fn === 'function'){
        try { card.star3fn(p); } catch(e){ console.warn('[三星专属]', e); }
        if(window.addAlert) addAlert('【三星专属】'+card.name+'：'+(card.star3||''));
      }
      // 天罡星宿：从 CNCards.gang3 查表（地煞不配）
      else if(window.CNCards && window.CNCards.gang3){
        var g3 = window.CNCards.gang3(card.name);
        if(g3){
          try { g3.run(p); } catch(e){ console.warn('[天罡三星]', e); }
          if(window.addAlert) addAlert('【天罡三星】'+card.name+'：'+g3.title);
        }
      }
    }

    updateMoney(); updateOwned(); updatePosition();

    var wentThree = (cnt === NEED_3);
    var wentFour  = (cnt === NEED_4);

    // 2026-10-18 老爹定：地煞三星后「不绝版」（可继续攒到四星）；
    //               天罡/武将/神明三星即全服绝版
    var isDiCard = (kind === 'di') || (card && card.type === 'di');
    if(wentThree && !isDiCard){
      // 天罡/武将/神明：三星 → 对别人绝版，自己还能继续抽到（再吃效果）
      var _me = player.indexOf(p);
      markRetiredFor(_me, name);
      if(window.addAlert) addAlert('【绝版】'+name+' 对其他人绝版了（'+p.name+' 仍可继续抽到）。');
    } else if(wentThree && isDiCard){
      if(window.addAlert) addAlert('【三星提示】'+p.name+' 把「'+name+'」升到三星（地煞不绝版，别人也还能抽到，可继续攒至四星）。');
    }
    // 地煞升到四星才绝版
    if(wentFour && isDiCard){
      // 地煞四星：全服绝版（这个不变）
      retired[name] = true;
      if(window.addAlert) addAlert('【绝版】'+name+' 已被 '+p.name+' 升到四星，此卡全服绝版。');
    }
    showStarUp(card, star, cnt, p, function(){
      // 彩蛋：任意一张卡合出「四星」→ 直接核弹
      if(wentFour){
        riceRocket(p, '四星彩蛋');
        return;
      }
      // 常规：升到三星且集齐五张三星 → 核弹
      if(wentThree && threeStarCount(p) >= WIN_3STAR){
        riceRocket(p, '五张三星');
      }
    }, kind);
  }

  /* 隐藏卡效果：把指定卡直升三星
   * 2026-10-18：提升后「立刻按三星效果结算一次」（×4） */
  function forceThree(p, cardName, cardObj){
    var d = deckOf(p);
    d[cardName] = Math.max(d[cardName] || 0, NEED_3);

    if(window.addAlert){
      addAlert('【无字天书】'+p.name+' 把「'+cardName+'」直接提到了三星。');
    }

    // 按三星效果立即结算一次（地煞 ×8，天罡/武将/神明 ×10）
    var tbl = starMultOf(cardObj || {name:cardName}, null);
    var mult = tbl[3];
    window.__STAR_MULT = mult;
    try {
      if(cardObj && typeof cardObj.fn === 'function'){
        cardObj.fn(p);
      } else if(window.CNCards){
        var found = null;
        (window.CNCards.WARRIORS || []).concat(window.CNCards.GODS || []).forEach(function(c){
          if(c.name === cardName) found = c;
        });
        if(found) found.fn(p);
      }
    } catch(e){ console.warn('[天书结算]', e); }
    window.__STAR_MULT = 1;

    if(window.addAlert){
      addAlert('【无字天书】「'+cardName+'」按三星效果（×'+mult+'）结算一次。');
    }

    updateMoney(); updateOwned(); updatePosition();

    // 检查是否因此凑满五张三星
    if(threeStarCount(p) >= WIN_3STAR){
      riceRocket(p, '五张三星');
    }
  }

  /* 升星弹窗 */
  function showStarUp(card, star, cnt, p, after, kind){
    var stars = '';
    var maxStar = 4;
    for(var i=0;i<maxStar;i++){ stars += (i < star ? '★' : '☆'); }
    var accent = star>=4 ? '#ff5a8a' : (star===3 ? '#ffd86a' : (star===2 ? '#c9a961' : '#9fe0ff'));

    var html =
      '<div style="padding:18px 18px 12px;text-align:center">' +
        '<div style="font-size:11px;letter-spacing:4px;color:'+accent+';opacity:.8;margin-bottom:10px">'+
          ((kind==='war')?'武将降临':(kind==='mech'?'机制降临':((kind==='di')||(card&&card.type==='di')?'地煞降临':(kind==='gang'||(card&&card.type==='gang')?'天罡降临':'神明降临'))))+'</div>' +
        ((card.icon) ? '<div style="font-size:32px;line-height:1;margin-bottom:6px">'+card.icon+'</div>' : '<div style="height:8px;margin-bottom:6px"></div>') +
        '<div style="font-size:24px;font-weight:900;color:'+accent+';letter-spacing:3px;text-shadow:0 0 18px '+accent+'66">'+card.name+'</div>' +
        '<div style="font-size:20px;color:'+accent+';letter-spacing:6px;margin:8px 0">'+stars+(star>=4?' <span style="font-size:11px;letter-spacing:1px">四星·彩蛋</span>':'')+'</div>' +
        '<div style="font-size:11px;color:#8a7040;margin-bottom:10px">已收集 '+cnt+' 张 · 效果 ×'+STAR_UP[star]+'</div>' +
        '<div style="height:1px;background:linear-gradient(90deg,transparent,'+accent+'66,transparent);margin:10px 0 12px"></div>' +
        '<div style="text-align:left;font-size:12px;line-height:1.75;color:#cfc3ae;padding:0 2px">' +
          '<div style="margin-bottom:6px"><span style="color:#9fe0ff;font-weight:700">一星：</span>'+card.text+'</div>' +
          '<div style="margin-bottom:6px;color:#8a7f68"><span style="color:#b0a48c;font-weight:700">二星：</span>无特殊效果（仅数值 ×2）</div>' +
          '<div><span style="color:#ffd86a;font-weight:700">三星：</span>'+(card.star3 || (window.CNCards && window.CNCards.gang3 && window.CNCards.gang3(card.name) ? window.CNCards.gang3(card.name).title : '无专属技能（仅数值 ×'+(STAR_UP[3])+'）'))+'</div>' +
        '</div>' +
        (star>=3 && !(kind==='di' || (card && card.type==='di')) ? '<div style="margin-top:8px;font-size:10px;color:#ffd86a">已激活三星专属技能</div>' : '') +
        /* 2026-10-18 老爹定：地煞升到三星时提示「四星可能有惊喜」 */
        ((kind==='di' || (card && card.type==='di')) && star===3 ?
          '<div style="margin-top:9px;padding:8px 10px;background:#1e1a12;border:1px dashed #8a7040;border-radius:8px;font-size:11px;line-height:1.7;color:#e8d7a8">' +
            '✦ <b style="color:#ffd86a">地煞不绝版</b> —— 继续收集同名卡，<b style="color:#ff7ab8">凑满 27 张可升至四星</b>，届时或有惊喜。' +
          '</div>' : '') +
        '<div style="margin-top:12px;font-size:10px;color:#5a4a3a">'+p.name+' · 三星 '+threeStarCount(p)+' / '+WIN_3STAR+'</div>' +
      '</div>' +
      '<button class="star-btn" id="cncardbtn" style="background:linear-gradient(160deg,'+accent+',#8a6f30);color:#1a1208">收 下</button>';

    var P=document.getElementById('popup'), txt=document.getElementById('popuptext');
    txt.innerHTML = html;
    P.className='star-popup';
    P.style.width='300px'; P.style.minWidth='300px'; P.style.padding='0';
    P.style.background='linear-gradient(160deg,#241c16 0%,#12100c 100%)';
    P.style.borderColor='#8a7040';

    var wrap=document.getElementById('popupwrap'), bgel=document.getElementById('popupbackground');
    if(bgel) bgel.style.display='block';
    wrap.style.display='block';

    var btn=document.getElementById('cncardbtn');
    function done(){
      if(bgel) bgel.style.display='none';
      wrap.style.display='none';
      P.className=''; P.style.background=''; P.style.borderColor='';
      if(after) after();
    }
    btn.addEventListener('click', done);
    btn.addEventListener('touchend', function(e){ e.preventDefault(); done(); });
  }

  /* 白饭核弹：终局 */
  /* ============================================================
   * 2026-10-18 老爹定：资产封顶测算
   *   上限 = 1,000 万亿 × 1 亿 = 1e15（正常对局碰不到，纯防溢出）
   *   有人到顶 → 本局直接结束，到顶者夺冠（跟核弹同一套结算）
   * ============================================================ */
  var MONEY_CAP = 1e15;   // 10,000,000 亿（总资产上限）

  /* 总资产 = 现金 + 金币折现 + 名下地产估值（地价 + 房子 + 旅馆） */
  function totalAssets(pl, idx){
    var cash = (pl.money || 0) + (pl.coins || 0) * 10000;
    var prop = 0;
    if(typeof square !== 'undefined'){
      for(var k=0;k<square.length;k++){
        var sq = square[k];
        if(!sq || sq.owner !== idx || !(sq.price > 0)) continue;
        var hp = sq.houseprice || 0;
        if(sq.mortgage){
          // 已抵押：只计地价一半（已变现），房子不算
          prop += sq.price * 0.5;
        } else {
          prop += sq.price + (sq.house || 0) * hp + (sq.hotel ? hp : 0);
        }
      }
    }
    return cash + prop;
  }

  function checkMoneyCap(){
    if(GAME_LOCKED) return false;
    for(var i=1;i<=pcount;i++){
      var pl = player[i];
      if(!pl) continue;
      if(totalAssets(pl, i) >= MONEY_CAP){
        riceRocket(pl, '资产封顶');
        return true;
      }
    }
    return false;
  }

  function riceRocket(winner, reason){
    // 2026-10-18 老爹定：触发者绝对第一，优先级高于一切代码
    // 哪怕触发那一刻他刚好破产、被淘汰、资产为负，也强制获胜
    GAME_LOCKED = true;
    window.__RICE_WINNER = winner;

    var ranking = [];
    for(var i=1;i<=pcount;i++){
      var pl=player[i]; if(!pl) continue;
      var val=0;
      for(var k=0;k<square.length;k++){
        var sq=square[k];
        if(sq.owner===i && sq.price>0){
          val += sq.price + sq.house * (sq.houseprice||0) + (sq.hotel ? (sq.houseprice||0) : 0);
        }
      }
      var isWin = (pl === winner) || (pl.index === winner.index);
      ranking.push({ name: pl.name, money: pl.money, prop: val, total: isWin ? Number.MAX_SAFE_INTEGER : (pl.money + val), isWin: isWin });
    }
    ranking.sort(function(a,b){
      if(a.isWin) return -1;
      if(b.isWin) return 1;
      return b.total - a.total;
    });

    var rows='';
    for(var r=0;r<ranking.length;r++){
      var x=ranking[r];
      rows += '<div style="display:flex;justify-content:space-between;padding:7px 4px;border-bottom:1px dashed #4a3f30;font-size:13px">' +
        '<span style="color:'+(x.isWin?'#ffd86a':'#ddd2b8')+';font-weight:'+(x.isWin?'900':'400')+'">' +
        (r+1)+'. '+(x.isWin?'👑 ':'')+x.name+'</span>' +
        '<span style="color:#c9a961">'+(window.fmtMoney?fmtMoney(x.total):x.total)+'</span>' +
      '</div>';
    }

    var html =
      '<div style="padding:20px 16px 14px;text-align:center">' +
        '<div style="font-size:52px;line-height:1;margin-bottom:10px">'+(reason==='资产封顶'?'💰🏛️':'🍚💥')+'</div>' +
        '<div style="font-size:22px;font-weight:900;color:#ffd86a;letter-spacing:4px;text-shadow:0 0 24px #ffd86a88">'+(reason==='资产封顶'?'大而不能倒':'白饭核弹')+'</div>' +
        '<div style="font-size:12px;color:#8a7040;margin:8px 0 16px;letter-spacing:2px">'+(reason==='资产封顶'?'成就达成 · 本局终结':(reason||'五张三星')+' · 天命所归')+'</div>' +
        '<div style="font-size:15px;color:#e8dcc8;margin-bottom:6px"><b style="color:#ffd86a">'+winner.name+'</b> '+(reason==='资产封顶'?'的资产突破 $1000兆（1,000,000,000,000,000），已大到不能倒——本局到此结束':'')+'</div>' +
        (reason==='资产封顶'?'<div style="font-size:11.5px;color:#9a8f78;line-height:1.6;margin-bottom:14px">体量大到足以左右全局，无人能撼动其地位。<br>「大而不能倒」——一旦达成，牌局再无悬念。</div>':(reason==='四星彩蛋'?'<div style="font-size:14px;color:#e8dcc8;margin-bottom:14px">合出四星彩蛋，直接夺冠</div>':'<div style="font-size:14px;color:#e8dcc8;margin-bottom:14px">集齐五张三星，直接夺冠</div>')) +
        '<div style="background:#12100c;border:1px solid #4a3f30;border-radius:10px;padding:8px 12px;text-align:left">'+rows+'</div>' +
        '<div style="font-size:11px;color:#5a4a3a;margin-top:12px">其余名次按「现金 + 房产估值」排序</div>' +
      '</div>' +
      '<button class="star-btn" style="background:linear-gradient(160deg,#ffd86a,#8a6f30);color:#1a1208" onclick="location.reload()">结 束 本 局</button>';

    var P=document.getElementById('popup'), txt=document.getElementById('popuptext');
    txt.innerHTML = html;
    P.className='star-popup';
    P.style.width='320px'; P.style.minWidth='320px'; P.style.padding='0';
    P.style.background='linear-gradient(160deg,#2a1408 0%,#0d0704 100%)';
    P.style.borderColor='#c9a961';

    var wrap=document.getElementById('popupwrap'), bgel=document.getElementById('popupbackground');
    if(bgel) bgel.style.display='block';
    wrap.style.display='block';
  }

  /* 2026-10-18：三星卡「对别人绝版、自己不绝版」 */
  // 保险：地煞星永不进入「三星对别人绝版」表（地煞三星不绝版、可攒四星）
  var DI_NAMES = null;
  function isDiStarName(name){
    if(!DI_NAMES){
      DI_NAMES = {};
      var db = (window.StarEngine && window.StarEngine.stars) ? window.StarEngine.stars() : null;
      if(db && db.length){
        for(var i=0;i<db.length;i++){ if(db[i].type === 'di') DI_NAMES[db[i].name] = true; }
      }
    }
    return !!DI_NAMES[name];
  }
  function markRetiredFor(playerIdx, name){
    if(isDiStarName(name)) return false;      // 保险：地煞一律不放行
    if(!(playerIdx in retiredBy)) retiredBy[playerIdx] = {};
    retiredBy[playerIdx][name] = true;
    return true;
  }
  /* 该玩家能否抽到这张卡：全服绝版（地煞四星）→ 谁都不能；别人三星过 → 只有那个人能抽 */
  function canDrawFor(p, name){
    if(retired[name]) return false;                  // 全服绝版（地煞四星）
    var me = player.indexOf(p);
    for(var idx in retiredBy){
      if(String(idx) !== String(me) && retiredBy[idx][name]) return false;  // 别人三星过 → 我不能抽
    }
    return true;
  }

  /* 导出 */
  window.CNStars = {
    isRetired: function(name){ return !!retired[name]; },
    retiredList: function(){ return retired; },
    canDrawFor: canDrawFor,
    markRetiredFor: markRetiredFor,
    isLocked: function(){ return GAME_LOCKED; },
    unlock: function(){ GAME_LOCKED = false; window.__RICE_WINNER = null; },
    checkMoneyCap: checkMoneyCap,
    totalAssets: totalAssets,
    MONEY_CAP: MONEY_CAP,
    drawAndApply: drawAndApply,
    forceThree: forceThree,
    starOf: starOf,
    threeStarCount: threeStarCount,
    starStats: starStats,
    deckOf: deckOf,
    STAR_UP: STAR_UP,
    NEED_4: NEED_4
  };
})();
