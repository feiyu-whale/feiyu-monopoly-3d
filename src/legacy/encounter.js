/* ============================================================
 * encounter.js — 奇遇（开局概率出现的全局效果）
 * 2026-10-18 v1
 * 规则：
 *   每局 30% 概率出现一条奇遇
 *   出现则按权重抽一条，对**全场**生效（本局有效）
 *   与「无字天书」互不影响，可同时出现
 * ============================================================ */
(function(){
  'use strict';

  var GOLD = '\u91d1';

  /* ---------- 六条奇遇（权重） ---------- */
  var POOL = [
    {
      id:'purple', name:'紫气东来', weight:18, color:'#ff7ab8',
      desc:'本局抽出的赐福必定为仙品'
    },
    {
      id:'gold', name:'金玉满堂', weight:22, color:'#ffd86a',
      desc:'本局开局每人额外获得 3 金币'
    },
    {
      id:'plenty', name:'群星璀璨', weight:20, color:'#9fe0ff',
      desc:'本局天罡星宿的出货权重整体提升 50%'
    },
    {
      id:'grace', name:'财神眷顾', weight:20, color:'#ffd86a',
      desc:'本局所有现金类收益提升 20%'
    },
    {
      id:'blaze', name:'烈火烹油', weight:15, color:'#ff9a4a',
      desc:'本局所有过路费提升 30%（节奏更快，也更容易被压垮）'
    },
    {
      id:'weather', name:'风调雨顺', weight:5, color:'#7dd87d',
      desc:'本局商店刷新完全免费'
    }
  ];

  var APPEAR_RATE = 0.30;      // 每局出现概率
  var active = null;           // 本局生效的奇遇

  function byId(id){
    for(var i=0;i<POOL.length;i++){ if(POOL[i].id===id) return POOL[i]; }
    return null;
  }

  /* ---------- 开局掷：是否出现、出现哪条 ---------- */
  function rollEncounter(){
    active = null;
    if(Math.random() >= APPEAR_RATE) return null;
    var total = 0;
    POOL.forEach(function(e){ total += e.weight; });
    var r = Math.random() * total;
    for(var i=0;i<POOL.length;i++){
      r -= POOL[i].weight;
      if(r < 0){ active = POOL[i]; break; }
    }
    if(!active) active = POOL[0];
    return active;
  }

  function current(){ return active; }
  function has(id){ return !!active && active.id === id; }

  /* ---------- 开局立刻生效的部分 ---------- */
  function applyOnStart(){
    if(!active) return;
    if(has('gold')){
      for(var i=1;i<=pcount;i++){
        if(player[i]) player[i].coins = (player[i].coins||0) + 3;
      }
      if(window.addAlert) addAlert('【奇遇·金玉满堂】全员额外获得 3 '+GOLD+'。');
      if(typeof updateMoney === 'function') updateMoney();
    }
  }

  /* ---------- 供各模块查询的钩子 ---------- */

  // 紫气东来：赐福只能抽仙品。boon.js 抽卡时调用
  function filterBoons(list){
    if(!has('purple')) return list;
    var xian = list.filter(function(b){ return b.tier === 'xian'; });
    return xian.length ? xian : list;
  }

  // 群星璀璨：天罡权重 ×1.5。cn_cards.js 里调用
  function boostGangWeight(w){
    if(!has('plenty')) return w;
    return { di:w.di, gang:Math.round(w.gang*1.5), god:w.god, war:w.war };
  }

  // 财神眷顾：现金类收益 +20%
  function gainMultiplier(){
    return has('grace') ? 1.2 : 1;
  }

  // 烈火烹油：过路费 +30%
  function tollMultiplier(){
    return has('blaze') ? 1.3 : 1;
  }

  // 风调雨顺：刷新免费
  function freeRefresh(){
    return has('weather');
  }

  /* ---------- 展示 ---------- */
  function announce(){
    if(!active){
      if(window.addAlert) addAlert('【奇遇】本局平顺无奇。');
      return;
    }
    if(window.addAlert){
      addAlert('【奇遇·'+active.name+'】'+active.desc);
    }
  }

  function banner(){
    if(!active) return '';
    return '<div style="text-align:center;font-size:10.5px;color:'+active.color+';margin:3px 0 2px">✦ 奇遇 · '+active.name+'：'+active.desc+'</div>';
  }

  window.Encounter = {
    POOL: POOL,
    // 测试专用：强制指定本局奇遇（传 null 清除）
    _setActive: function(e){ active = e; },
    APPEAR_RATE: APPEAR_RATE,
    roll: rollEncounter,
    current: current,
    has: has,
    applyOnStart: applyOnStart,
    filterBoons: filterBoons,
    boostGangWeight: boostGangWeight,
    gainMultiplier: gainMultiplier,
    tollMultiplier: tollMultiplier,
    freeRefresh: freeRefresh,
    announce: announce,
    banner: banner
  };
})();
