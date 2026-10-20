/* ============================================================
 * boon.js — 天罡地煞赐福（开局四选一 · 全员投票）
 * 2026-10-18 v1
 * 规则：
 *   开局随机抽 4 条赐福，不挑品阶
 *   每张写明 名字 / 品阶 / 效果，再看再选
 *   人类自己点，AI 随机挑；票数多者胜，平票直接随机定
 * 品阶：凡品 / 灵品 / 仙品
 * ============================================================ */
(function(){
  'use strict';

  var GOLD = '\u91d1';   // 金（避免 emoji 显示成方框）

  /* ---------- 品阶配色 ---------- */
  var TIER = {
    fan:   { name:'凡品', color:'#9fe0ff', glow:'#1e5a7a', rank:1 },
    ling:  { name:'灵品', color:'#ffd86a', glow:'#8a6f30', rank:2 },
    xian:  { name:'仙品', color:'#ff7ab8', glow:'#a8329a', rank:3 }
  };

  /* ---------- SVG 图标：凡品八角星 / 灵品八卦阵 / 仙品水墨卷轴 ---------- */
  function iconSVG(tier){
    var c = TIER[tier].color;
    if(tier === 'fan'){
      var pts = [];
      for(var i=0;i<16;i++){
        var r = (i%2===0) ? 13 : 5.5;
        var a = Math.PI*2*i/16 - Math.PI/2;
        pts.push((15 + r*Math.cos(a)).toFixed(1) + ',' + (15 + r*Math.sin(a)).toFixed(1));
      }
      return '<svg width="30" height="30" viewBox="0 0 30 30"><polygon points="'+pts.join(' ')+
        '" fill="none" stroke="'+c+'" stroke-width="1.4"/><circle cx="15" cy="15" r="2" fill="'+c+'"/></svg>';
    }
    if(tier === 'ling'){
      var bars = '';
      for(var k=0;k<8;k++){
        var ang = 360*k/8;
        bars += '<rect x="14" y="3" width="2" height="7" fill="'+c+'" opacity=".85" transform="rotate('+ang+' 15 15)"/>';
      }
      return '<svg width="30" height="30" viewBox="0 0 30 30">'+bars+
        '<circle cx="15" cy="15" r="9.5" fill="none" stroke="'+c+'" stroke-width="1.2" opacity=".8"/>'+
        '<circle cx="15" cy="15" r="3" fill="none" stroke="'+c+'" stroke-width="1.2"/>'+
        '<path d="M15 10 A5 5 0 0 1 20 15" fill="none" stroke="'+c+'" stroke-width="1.1"/>'+
        '<path d="M15 20 A5 5 0 0 1 10 15" fill="none" stroke="'+c+'" stroke-width="1.1"/></svg>';
    }
    // 仙品：水墨卷轴
    return '<svg width="30" height="30" viewBox="0 0 30 30">'+
      '<rect x="7" y="6" width="16" height="18" rx="1.5" fill="'+c+'" opacity=".14"/>'+
      '<rect x="7" y="6" width="16" height="18" rx="1.5" fill="none" stroke="'+c+'" stroke-width="1.3"/>'+
      '<rect x="4.5" y="4.5" width="3" height="21" rx="1.5" fill="'+c+'" opacity=".85"/>'+
      '<rect x="22.5" y="4.5" width="3" height="21" rx="1.5" fill="'+c+'" opacity=".85"/>'+
      '<path d="M11 11 q4 -2 8 0 M11 15 q4 -2 8 0 M11 19 q3 -1.5 6 0" fill="none" stroke="'+c+'" stroke-width="1.1" opacity=".9"/></svg>';
  }

  /* ============================================================
   * 七条赐福
   *   id     内部标识
   *   name   显示名（去侵权化）
   *   tier   品阶
   *   desc   效果说明（选的时候就给玩家看）
   * ============================================================ */
  var BOONS = [
    {
      id:'snowball', name:'滚雪成山', tier:'xian',
      desc:'立刻获得 5 金币；利息上限由 5 提升至 7（每经过一个角结算一次利息）'
    },
    {
      id:'starCall', name:'星枢引曜', tier:'xian',
      desc:'抽到天罡星宿的概率提升两成（权重 ×1.2）'
    },
    {
      id:'climb', name:'更上层楼', tier:'ling',
      desc:'每次掷骰前，可多花 10% 的现金，额外再掷一次骰子'
    },
    {
      id:'gleam', name:'宝光流转', tier:'ling',
      desc:'使用按百分比扣别人钱的卡牌时，有 30% 概率触发暴击（效果翻倍）'
    },
    {
      id:'foresee', name:'先知先觉', tier:'ling',
      desc:'提前看到本回合会走到哪一格（棋盘高亮 + 提示）'
    },
    {
      id:'auctionCut', name:'拍场抽佣', tier:'fan',
      desc:'你放弃购买的无主地皮若被别人拍走，你可向银行抽取成交额的 10% 作为中介费'
    },
    {
      id:'giant', name:'巨灵显化', tier:'fan',
      desc:'立刻增加 50000 现金，并免疫下一次大额过路费'
    },
    /* ---------- 2026-10-18 新增六条（老爹定稿） ---------- */
    {
      id:'wolves', name:'杀破狼·极', tier:'xian',
      desc:'收租时，有 30% 概率触发双倍暴击（本次租金翻倍）'
    },
    {
      id:'sprout', name:'拔苗助长', tier:'ling',
      desc:'升级商店消耗的金币减少 10%'
    },
    {
      id:'fortune', name:'福星高照', tier:'ling',
      desc:'立刻获得 50000 现金，并免交下一次过路费（不限金额）'
    },
    {
      id:'shift', name:'乾坤大挪移', tier:'xian',
      desc:'每回合结束时，随机将场上一名玩家的一块地皮与你的一块地皮互换'
    },
    {
      id:'treasure', name:'聚宝盆', tier:'ling',
      desc:'每次经过起点，额外获得当前现金的 5%'
    },
    {
      id:'allin', name:'孤注一掷', tier:'xian',
      desc:'立刻获得 10 金币，但此后所有税费与过路费永久翻倍'
    }
  ];

  function byId(id){
    for(var i=0;i<BOONS.length;i++){ if(BOONS[i].id===id) return BOONS[i]; }
    return null;
  }

  /* ---------- 运行时状态 ---------- */
  var chosen = {};        // chosen[玩家序号] = 赐福 id
  var rollShopVotes = null;

  /* ---------- 利息点：四个角 0/10/20/30 ---------- */
  var CORNERS = [0,10,20,30];

  function boonOf(p){
    var i = (typeof player !== 'undefined') ? player.indexOf(p) : -1;
    if(i < 1) return null;
    return chosen[i] || null;
  }

  /* ============================================================
   * 一、开局抽取 + 投票
   * ============================================================ */
  function drawFour(){
    var pool = BOONS.slice();
    // 2026-10-18：奇遇·紫气东来——本局赐福必定仙品
    if(window.Encounter && window.Encounter.filterBoons){ pool = window.Encounter.filterBoons(pool); }
    var out = [];
    for(var i=0;i<4 && pool.length;i++){
      var k = Math.floor(Math.random()*pool.length);
      out.push(pool.splice(k,1)[0]);
    }
    return out;
  }

  function startVote(after){
    if(typeof player === 'undefined' || typeof pcount === 'undefined'){ if(after) after(); return; }

    var four = drawFour();
    var votes = {};       // id -> 票数
    four.forEach(function(b){ votes[b.id] = 0; });

    var humans = [], ais = [];
    for(var i=1;i<=pcount;i++){
      if(player[i] && player[i].human) humans.push(i); else ais.push(i);
    }

    // AI 随机投票
    ais.forEach(function(i){
      votes[four[Math.floor(Math.random()*four.length)].id]++;
    });

    var hi = 0;
    function nextHuman(){
      if(hi >= humans.length){ finish(); return; }
      var pi = humans[hi++];
      renderVote(four, votes, player[pi], pi, nextHuman);
    }
    function finish(){
      // 找票数最高；平票直接随机
      var max = -1, top = [];
      four.forEach(function(b){
        if(votes[b.id] > max){ max = votes[b.id]; top = [b]; }
        else if(votes[b.id] === max){ top.push(b); }
      });
      var win = top[Math.floor(Math.random()*top.length)];
      // 全员都拿到同一条（每人一份，谁选的都是这条）
      for(var i=1;i<=pcount;i++){ if(player[i]) chosen[i] = win.id; }
      applyOnStart(win);
      showResult(win, votes, after);
    }
    if(!humans.length){ finish(); return; }
    nextHuman();
  }

  function renderVote(four, votes, p, pi, next){
    var rows = '';
    four.forEach(function(b){
      var t = TIER[b.tier];
      rows +=
        '<div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:7px;background:#1a1410;border:1px solid '+t.glow+';border-radius:9px;text-align:left">'+
          '<div style="flex:0 0 32px;text-align:center">'+iconSVG(b.tier)+'</div>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:12.5px;color:'+t.color+';font-weight:700">'+b.name+
              ' <span style="font-size:10px;opacity:.85">'+t.name+'</span>'+
              ' <span style="font-size:9.5px;color:#8a7f68">票 '+votes[b.id]+'</span></div>'+
            '<div style="font-size:10px;color:#9a8f78;line-height:1.5;margin-top:2px">'+b.desc+'</div>'+
          '</div>'+
          '<button class="star-btn" style="width:auto;margin:0;padding:6px 10px;font-size:11px" onclick="Boon._vote(\''+b.id+'\',\''+pi+'\')">选它</button>'+
        '</div>';
    });

    var html =
      '<div style="padding:16px 14px 10px">'+
        '<div style="text-align:center;font-size:15px;font-weight:900;color:#c9a961;letter-spacing:3px;margin-bottom:3px">\u2728 天罡地煞赐福</div>'+
        '<div style="text-align:center;font-size:11px;color:#8a7f68;margin-bottom:9px">'+p.name+' 请择其一 · 全员票多者胜</div>'+
        rows+
      '</div>';

    var P=document.getElementById('popup'), txt=document.getElementById('popuptext');
    txt.innerHTML = html;
    P.className='star-popup';
    P.style.width='330px'; P.style.minWidth='330px'; P.style.padding='0';
    P.style.background='linear-gradient(160deg,#241c16 0%,#12100c 100%)';
    P.style.borderColor='#8a7040';
    var wrap=document.getElementById('popupwrap'), bgel=document.getElementById('popupbackground');
    if(bgel) bgel.style.display='block';
    wrap.style.display='block';

    window.__BOON_VOTE = { four:four, votes:votes, next:next, done:false };
  }

  function vote(id, pi){
    var v = window.__BOON_VOTE;
    if(!v || v.done){ return; }
    v.done = true;
    if(v.votes[id] != null) v.votes[id]++;
    var nx = v.next;
    setTimeout(function(){ if(nx) nx(); }, 260);
  }

  function showResult(b, votes, after){
    var t = TIER[b.tier];
    var html =
      '<div style="padding:18px 16px 12px;text-align:center">'+
        '<div style="font-size:11px;letter-spacing:4px;color:'+t.color+';opacity:.8;margin-bottom:10px">赐福降临</div>'+
        '<div style="margin-bottom:8px">'+iconSVG(b.tier)+'</div>'+
        '<div style="font-size:22px;font-weight:900;color:'+t.color+';letter-spacing:3px">'+b.name+'</div>'+
        '<div style="font-size:11px;color:'+t.color+';opacity:.8;margin-top:4px">'+t.name+' · 得票 '+votes[b.id]+'</div>'+
        '<div style="height:1px;background:linear-gradient(90deg,transparent,'+t.color+'66,transparent);margin:12px 0 10px"></div>'+
        '<div style="font-size:12.5px;color:#e8dcc8;line-height:1.8">'+b.desc+'</div>'+
      '</div>'+
      '<button class="star-btn" style="background:linear-gradient(160deg,'+t.color+',#8a6f30);color:#1a1208" onclick="Boon._close()">领 受</button>';

    var P=document.getElementById('popup'), txt=document.getElementById('popuptext');
    txt.innerHTML = html;
    P.className='star-popup';
    P.style.width='300px'; P.style.minWidth='300px'; P.style.padding='0';
    P.style.background='linear-gradient(160deg,#241c16 0%,#12100c 100%)';
    P.style.borderColor='#8a7040';
    var wrap=document.getElementById('popupwrap'), bgel=document.getElementById('popupbackground');
    if(bgel) bgel.style.display='block';
    wrap.style.display='block';
    window.__BOON_AFTER = after || null;
  }

  function closeResult(){
    var wrap=document.getElementById('popupwrap'), bgel=document.getElementById('popupbackground');
    if(bgel) bgel.style.display='none';
    if(wrap) wrap.style.display='none';
    var P=document.getElementById('popup');
    if(P){ P.className=''; P.style.background=''; P.style.borderColor=''; }
    var f = window.__BOON_AFTER; window.__BOON_AFTER = null;
    if(f) f();
  }

  /* ============================================================
   * 二、开局即生效的赐福
   * ============================================================ */
  function applyOnStart(b){
    if(b.id === 'snowball'){
      for(var i=1;i<=pcount;i++){
        var p = player[i]; if(!p) continue;
        p.coins = (p.coins||0) + 5;
        p.interestCap = 7;      // 利息上限 5 → 7
      }
      if(window.addAlert) addAlert('【滚雪成山】全员获得 5 金币，利息上限提升至 7。');
      if(typeof updateMoney === 'function') updateMoney();
    }
    if(b.id === 'giant'){
      for(var j=1;j<=pcount;j++){
        var q = player[j]; if(!q) continue;
        q.money += 50000;
        q.freeBigRent = (q.freeBigRent||0) + 1;   // 免疫下一次大额过路费
      }
      if(window.addAlert) addAlert('【巨灵显化】全员获得 $50000，并各免疫一次大额过路费。');
      if(typeof updateMoney === 'function') updateMoney();
    }
    // 2026-10-18 新增：福星高照——5 万现金 + 免交下一次过路费（不限金额）
    if(b.id === 'fortune'){
      for(var m=1;m<=pcount;m++){
        var r = player[m]; if(!r) continue;
        r.money += 50000;
        r.freeRentOnce = (r.freeRentOnce||0) + 1;
      }
      if(window.addAlert) addAlert('【福星高照】全员获得 $50000，并各免交一次过路费。');
      if(typeof updateMoney === 'function') updateMoney();
    }
    // 2026-10-18 新增：孤注一掷——立刻 10 金币，此后税费与过路费永久翻倍
    if(b.id === 'allin'){
      for(var n=1;n<=pcount;n++){
        var t = player[n]; if(!t) continue;
        t.coins = (t.coins||0) + 10;
        t.doubleToll = true;
      }
      if(window.addAlert) addAlert('【孤注一掷】全员获得 10 金币，但此后税费与过路费永久翻倍！');
      if(typeof updateMoney === 'function') updateMoney();
    }
  }

  /* ============================================================
   * 三、掷骰前：更上层楼 / 先知先觉
   *   roll() 里调用
   * ============================================================ */
  function canClimb(p){
    if(boonOf(p) !== 'climb') return false;
    return true;
  }

  function doClimb(p){
    var cost = Math.round((p.money||0) * 0.1);
    if(cost <= 0) return false;
    p.money -= cost;
    if(window.addAlert) addAlert('【更上层楼】'+p.name+' 花费 $'+cost+'（现金 10%）换取额外一掷。');
    if(typeof updateMoney === 'function') updateMoney();
    return true;
  }

  function showForesee(p){
    if(boonOf(p) !== 'foresee') return;
    var d1 = Math.floor(Math.random()*6)+1, d2 = Math.floor(Math.random()*6)+1;
    var target = (p.position + d1 + d2) % 40;
    var sq = (typeof square !== 'undefined') ? square[target] : null;
    var name = sq ? sq.name : ('第 '+target+' 格');
    var el = document.getElementById('cell'+target);
    if(el){
      el.dataset.boonGlow = '1';
      el.style.boxShadow = '0 0 0 3px #ffd86a, 0 0 14px #ffd86a';
      setTimeout(function(){
        if(el.dataset.boonGlow === '1'){ el.style.boxShadow = ''; delete el.dataset.boonGlow; }
      }, 6000);
    }
    if(window.addAlert) addAlert('【先知先觉】'+p.name+' 预见：本回合将走到「'+name+'」。');
  }

  /* ============================================================
   * 四、宝光流转：百分比扣钱卡暴击
   *   stars_rank.js 里调用
   * ============================================================ */
  function onPercentCard(p, card){
    if(boonOf(p) !== 'gleam') return;
    if(Math.random() >= 0.3) return;
    // 效果翻倍：临时把乘数翻倍，再补一次同样效果
    var prev = window.__STAR_MULT || 1;
    window.__STAR_MULT = prev * 2;
    try {
      if(typeof card.fn === 'function') card.fn(p);
    } catch(e){ console.warn('[宝光流转]', e); }
    window.__STAR_MULT = prev;
    if(window.addAlert) addAlert('【宝光流转】'+p.name+' 触发暴击！「'+card.name+'」效果翻倍。');
    if(typeof updateMoney === 'function') updateMoney();
  }

  /* ============================================================
   * 2026-10-18 新增：杀破狼·极——收租 30% 概率双倍
   *   monopoly.js 的 land() 收租处调用，返回翻倍后的租金
   * ============================================================ */
  function rentCrit(p, rent){
    if(boonOf(p) !== 'wolves') return rent;
    if(Math.random() >= 0.3) return rent;
    if(window.addAlert) addAlert('【杀破狼·极】'+p.name+' 收租暴击！租金翻倍。');
    return rent * 2;
  }

  /* ============================================================
   * 2026-10-18 新增：拔苗助长——升级金币减 10%
   *   cn_cards.js 的 upgradeLevel 调用
   * ============================================================ */
  function discountUpgrade(p, cost){
    if(boonOf(p) !== 'sprout') return cost;
    return Math.max(1, Math.round(cost * 0.9));
  }

  /* ============================================================
   * 2026-10-18 新增：聚宝盆——经过起点领当前现金 5%
   *   monopoly.js 的 moveAnimated 调用
   * ============================================================ */
  function onPassStart(p){
    if(boonOf(p) !== 'treasure') return;
    var gain = Math.round((p.money||0) * 0.05);
    if(gain <= 0) return;
    p.money += gain;
    if(window.addAlert) addAlert('【聚宝盆】'+p.name+' 经过起点，额外获得 $'+gain+'（现金 5%）。');
    if(typeof updateMoney === 'function') updateMoney();
  }

  /* ============================================================
   * 2026-10-18 新增：乾坤大挪移——每回合结束随机互换一块地
   *   monopoly.js 的 play()（换人）调用
   * ============================================================ */
  function shiftProperty(p){
    if(boonOf(p) !== 'shift') return;
    var mine = [], others = [];
    for(var i=0;i<square.length;i++){
      var sq = square[i];
      if(!sq || sq.price === 0 || sq.owner <= 0) continue;
      if(sq.owner === player.indexOf(p)) mine.push(i);
      else others.push(i);
    }
    if(!mine.length || !others.length) return;
    var a = mine[Math.floor(Math.random()*mine.length)];
    var b = others[Math.floor(Math.random()*others.length)];
    var oa = square[a].owner, ob = square[b].owner;
    square[a].owner = ob;
    square[b].owner = oa;
    if(window.addAlert) addAlert('【乾坤大挪移】'+p.name+' 的「'+square[a].name+'」与「'+square[b].name+'」互换了主人。');
    if(typeof updateOwned === 'function') updateOwned();
  }

  /* ============================================================
   * 2026-10-18 新增：孤注一掷——税费与过路费翻倍（供 land() 查）
   * ============================================================ */
  function tollMultiplier(p){
    if(!boonOf(p)) return 1;
    // 孤注一掷对本局所有玩家都生效（投票后全员都拿了同一条）
    return p.doubleToll ? 2 : 1;
  }

  /* ============================================================
   * 五、拍场抽佣：放弃购买 → 被拍走 → 抽 10%
   * ============================================================ */
  function onAuctionSold(bidderIndex, price, propertyIndex){
    if(!price || price <= 0) return;
    for(var i=1;i<=pcount;i++){
      var p = player[i];
      if(!p || i === bidderIndex) continue;
      if(boonOf(p) !== 'auctionCut') continue;
      if(p.__declinedAuction !== propertyIndex) continue;
      var cut = Math.round(price * 0.1);
      p.money += cut;
      p.__declinedAuction = -1;
      if(window.addAlert) addAlert('【拍场抽佣】'+p.name+' 抽取中介费 $'+cut+'（成交 $'+price+' 的 10%）。');
      if(typeof updateMoney === 'function') updateMoney();
    }
  }

  function markDeclined(p, propertyIndex){
    if(boonOf(p) === 'auctionCut') p.__declinedAuction = propertyIndex;
  }

  /* ============================================================
   * 六、星枢引曜：天罡权重 ×1.2
   *   cn_cards.js 的 rollShop 里调用
   * ============================================================ */
  function adjustWeights(p, w){
    if(boonOf(p) !== 'starCall') return w;
    var out = { di:w.di, gang:Math.round(w.gang*1.2), god:w.god, war:w.war };
    return out;
  }

  /* ============================================================
   * 七、利息：经过四个角各结算一次
   *   monopoly.js 的 moveAnimated 里调用
   * ============================================================ */
  function onPassCorner(p, pos){
    if(CORNERS.indexOf(pos) < 0) return;
    if(boonOf(p) !== 'snowball') return;
    var cap = p.interestCap || 5;
    // 利息 = 存款金币的 10%，封顶 cap（金铲铲算法：每 10 币生 1 币，上限 cap）
    var coins = p.coins || 0;
    var interest = Math.min(cap, Math.floor(coins / 10));
    if(interest <= 0) return;
    p.coins = coins + interest;
    if(window.addAlert) addAlert('【滚雪成山】'+p.name+' 过角结算利息 +'+interest+' '+GOLD+'（存款 '+coins+'）。');
    if(typeof updateMoney === 'function') updateMoney();
  }

  /* ============================================================
   * 对外接口
   * ============================================================ */
  window.Boon = {
    BOONS: BOONS,
    TIER: TIER,
    startVote: startVote,
    _vote: vote,
    _close: closeResult,
    boonOf: boonOf,
    canClimb: canClimb,
    doClimb: doClimb,
    showForesee: showForesee,
    onPercentCard: onPercentCard,
    onAuctionSold: onAuctionSold,
    markDeclined: markDeclined,
    adjustWeights: adjustWeights,
    onPassCorner: onPassCorner,
    rentCrit: rentCrit,
    discountUpgrade: discountUpgrade,
    onPassStart: onPassStart,
    shiftProperty: shiftProperty,
    tollMultiplier: tollMultiplier,
    iconSVG: iconSVG,
    getChosen: function(){ return chosen; }
  };
})();
