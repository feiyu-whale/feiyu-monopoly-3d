/* ============================================================
 * cn_cards.js — 中国版专属：武将卡 / 神明卡 / 彩票站
 * 2026-10-18 v1
 * 规则：纯前端，抽卡即结算，全部中文
 * ============================================================ */
(function(){
  'use strict';

  /* ---------- 武将卡（天罡系：偏收益） ---------- */
  var WARRIORS = [
    { name:'关羽', icon:'⚔️', title:'武圣附体', text:'随机夺取一名对手的一块空地', star3:'【武圣】所有对手各被夺走一块地', star3fn:function(p){ allSteal(p); }, fn:function(p){ stealProperty(p); } },
    { name:'张飞', icon:'🌪️', title:'当阳怒吼', text:'所有对手失去 3000', star3:'【喝断当阳桥】所有对手现金减半', star3fn:function(p){ allOpponents(p,function(o){ o.money=Math.round(o.money/2); addAlert(o.name+' 现金减半。'); }); }, fn:function(p){ allOpponents(p, function(o){ lose(o, 3000); }); } },
    { name:'赵云', icon:'🐎', title:'七进七出', text:'立即再掷一次骰子', star3:'【七进七出】连续再掷 3 次骰子', star3fn:function(p){ p.starExtraRoll=(p.starExtraRoll||0)+3; }, fn:function(p){ p.starExtraRoll = true; } },
    { name:'诸葛亮', icon:'🪶', title:'草船借箭', text:'从银行领取 12000', star3:'【八阵图】领取全场现金总和的 20%', star3fn:function(p){ var t=0; for(var i=1;i<=pcount;i++) t+=player[i].money; gain(p, Math.round(t*0.2), true); }, fn:function(p){ gain(p, 12000); } },
    { name:'吕布', icon:'🗡️', title:'无双乱舞', text:'随机指定一名对手，该对手向你支付 8000', star3:'【无双】随机一名对手的全部现金归你', star3fn:function(p){ var o=opponents(p); if(!o.length){gain(p,20000);return;} var t=o[rnd(o.length)]; var amt=t.money; t.money=0; p.money+=amt; addAlert('【无双】'+t.name+' 的全部现金 $'+amt+' 归 '+p.name+'。'); }, fn:function(p){ takeFromOne(p, 8000); } },
    { name:'黄忠', icon:'🏹', title:'百步穿杨', text:'随机拆掉一名对手的一栋建筑', star3:'【万箭齐发】拆掉所有对手的全部建筑', star3fn:function(p){ var me=player.indexOf(p),n=0; for(var i=0;i<square.length;i++){var q=square[i]; if(q.owner>0&&q.owner!==me&&(q.house>0||q.hotel)){q.house=0;q.hotel=0;n++;}} addAlert('【万箭齐发】拆掉 '+n+' 处建筑。'); }, fn:function(p){ demolishOne(p); } },
    { name:'马超', icon:'🐴', title:'西凉铁骑', text:'向前移动 3 格', star3:'【西凉铁骑】前进 10 格', star3fn:function(p){ move(p,10); }, fn:function(p){ move(p, 3); } },
    { name:'周瑜', icon:'🔥', title:'火烧连营', text:'所有对手各失去 10% 现金', star3:'【火烧赤壁】所有对手各失去 30% 现金', star3fn:function(p){ allOpponents(p,function(o){ var t=Math.round(o.money*0.3); o.money-=t; addAlert(o.name+' 失去 $'+t+'。'); }); }, fn:function(p){ allOpponents(p, function(o){ lose(o, Math.round(o.money*0.1), true); }); } },
    { name:'张辽', icon:'🛡️', title:'威震逍遥津', text:'下 2 次踩地免交过路费', star3:'【威震逍遥津】永久免过路费 5 次', star3fn:function(p){ p.starFreeRent=(p.starFreeRent||0)+5; }, fn:function(p){ p.starFreeRent = (p.starFreeRent||0) + 2; } },
    { name:'甘宁', icon:'⛵', title:'百骑劫营', text:'随机指定一名对手，夺走该对手 15% 现金', star3:'【百骑劫营】每名对手各被抢走 25%', star3fn:function(p){ allOpponents(p,function(o){ var t=Math.round(o.money*0.25); o.money-=t; p.money+=t; addAlert(o.name+' 被抢 $'+t+'。'); }); }, fn:function(p){ takePercentOne(p, 15); } }
  ];

  /* ---------- 神明卡（地煞系：偏运气，有正有负） ---------- */
  var GODS = [
    { name:'土地公', icon:'🏮', title:'土地庇佑', text:'领取 9000', star3:'【地祇显灵】领取当前现金的 100%（翻倍）', star3fn:function(p){ gain(p, p.money, true); }, fn:function(p){ gain(p, 9000); } },
    { name:'财神爷', icon:'💰', title:'财源广进', text:'领取当前现金的 12%', star3:'【财源滚滚】领取全场现金总和的 30%', star3fn:function(p){ var t=0; for(var i=1;i<=pcount;i++) t+=player[i].money; gain(p, Math.round(t*0.3), true); }, fn:function(p){ gain(p, Math.round(p.money*0.12), true); } },
    { name:'穷神', icon:'👻', title:'穷神缠身', text:'失去 7000', star3:'【霉运缠身】随机一名对手失去 50% 现金', star3fn:function(p){ takePercentOne(p,50); }, fn:function(p){ lose(p, 7000); } },
    { name:'灶王爷', icon:'🍚', title:'上天言好事', text:'领取 6000，所有对手各领 2000', star3:'【上天言好事】全场每人领取其现金的 20%', star3fn:function(p){ for(var i=1;i<=pcount;i++) gain(player[i], Math.round(player[i].money*0.2), true); }, fn:function(p){ gain(p, 6000); allOpponents(p, function(o){ gain(o, 2000); }); } },
    { name:'月老', icon:'❤️', title:'红线牵连', text:'随机指定一名对手，与其平分现金', star3:'【天作之合】与现金最多的对手平分全部资产', star3fn:function(p){ var o=opponents(p); if(!o.length){gain(p,10000);return;} o.sort(function(a,b){return b.money-a.money;}); var t=o[0]; var avg=Math.round((p.money+t.money)/2); p.money=avg;t.money=avg; addAlert('【天作之合】'+p.name+' 与最富的 '+t.name+' 平分为 $'+avg+'。'); }, fn:function(p){ balanceOne(p); } },
    { name:'阎王爷', icon:'💀', title:'生死簿', text:'随机指定一名对手，该对手直接进监狱', star3:'【生死簿】随机两名对手进监狱', star3fn:function(p){ var o=opponents(p); if(!o.length){gain(p,10000);return;} for(var k=0;k<Math.min(2,o.length);k++){ o[k].jail=true;o[k].jailroll=0; addAlert(o[k].name+' 被抓进监狱。'); } }, fn:function(p){ jailOne(p); } },
    { name:'龙王', icon:'🐉', title:'行云布雨', text:'随机传送到一块无主地', star3:'【龙宫赐福】免费获得一块最贵的无主地', star3fn:function(p){ freeBest(p); }, fn:function(p){ teleportFree(p); } },
    { name:'观音', icon:'🪷', title:'普渡众生', text:'全场每人领取 4000', star3:'【普渡众生】全场每人领取其现金的 15%', star3fn:function(p){ for(var i=1;i<=pcount;i++) gain(player[i], Math.round(player[i].money*0.15), true); }, fn:function(p){ for(var i=1;i<=pcount;i++) gain(player[i], 4000); } },
    { name:'雷公', icon:'⚡', title:'五雷轰顶', text:'随机指定一名对手，该对手失去 30% 现金', star3:'【五雷轰顶】随机一名对手失去 60% 现金', star3fn:function(p){ takePercentOne(p,60); }, fn:function(p){ takePercentOne(p, 30); } },
    { name:'和合二仙', icon:'🎎', title:'和气生财', text:'领取 5000，解除自身所有负面状态', star3:'【和气生财】领取现金 50%，清除全部负面状态', star3fn:function(p){ gain(p, Math.round(p.money*0.5), true); p.starIsolate=0;p.starLimitMove=0;p.jail=false; }, fn:function(p){ gain(p, 5000); p.starIsolate=0; p.starLimitMove=0; } }
  ];

  /* ---------- 机制怪卡（超模专属） ---------- */
  var MECHA = [
    { name:'复制', icon:'🪞', title:'镜花水月', text:'复制上一张抽到的卡，再执行一次', fn:function(p){ repeatLast(p); } },
    { name:'倍数', icon:'✖️', title:'三倍暴击', text:'立即领取当前现金的 200%', fn:function(p){ gain(p, p.money*2, true); } },
    { name:'翻倍', icon:'🎲', title:'孤注一掷', text:'现金翻倍，但 50% 概率全部归零', fn:function(p){ if(rnd(2)===0){ gain(p, p.money, true); } else { var l=p.money-1000; if(l>0){ p.money=1000; addAlert('【孤注一掷】'+p.name+' 输光了，只剩 $1000。'); } } } },
    { name:'吸血', icon:'🩸', title:'血魔附体', text:'每名对手各被夺走 10% 现金', fn:function(p){ allOpponents(p, function(o){ var t=Math.round(o.money*0.1); o.money-=t; p.money+=t; addAlert(o.name+' 被抽走 $'+t+'。'); }); } },
    { name:'清零', icon:'💧', title:'散财童子', text:'随机一名对手现金减半', fn:function(p){ halveOne(p); } },
    { name:'税收', icon:'📜', title:'苛政猛于虎', text:'所有对手按总资产 5% 缴税给你', fn:function(p){ allOpponents(p, function(o){ var t=Math.round(o.money*0.05); if(t>0){ o.money-=t; p.money+=t; addAlert(o.name+' 缴税 $'+t+'。'); } }); } },
    { name:'拆迁', icon:'🚜', title:'推土机', text:'拆掉所有对手建筑', fn:function(p){ var me=player.indexOf(p), n=0; for(var i=0;i<square.length;i++){ var s=square[i]; if(s.owner>0&&s.owner!==me&&(s.house>0||s.hotel)){ s.house=0; s.hotel=0; n++; } } gain(p, n*15000); } },
    { name:'天命', icon:'☯️', title:'天命所归', text:'免费获得一块无主空地', fn:function(p){ teleportFree(p); } }
  ];

  /* 2026-10-18：机制卡全局限量——每种一局只有 4 张 */
  var MECH_TOTAL = 4;
  var mechLeft = {};
  MECHA.forEach(function(c){ mechLeft[c.name] = MECH_TOTAL; });

  /* 已抽出、可储存的机制卡（每名玩家各存一份） */
  var mechBag = {};
  function bagOf(p){
    var i = player.indexOf(p);
    if(i < 1) i = 0;
    if(!mechBag[i]) mechBag[i] = [];
    return mechBag[i];
  }
  function mechRemaining(){ var n=0; for(var k in mechLeft) n += mechLeft[k]; return n; }

  var lastCard = null;

  /* ============================================================
   * 隐藏卡「无字天书」
   * 开局 10% 概率出现（出现才可能抽到），抽中概率 0.01%
   * 可存进卡袋，手动使用：把当前手上某张卡直升三星
   * ============================================================ */
  var HIDDEN = {
    name:'无字天书', icon:'📜', title:'天机不可泄露',
    text:'选择一张你已收集的卡，立刻将其升至三星',
    fn:function(p){ /* 使用逻辑在 useHidden 里 */ }
  };
  var hiddenInPlay = false;      // 本局是否出现（开局掷骰决定）
  var hiddenBag = false;         // 该玩家是否已抽到（持有中）

  function rollHiddenPresence(){
    hiddenInPlay = Math.random() < 0.50;   // 每局 50%
    hiddenBag = false;
    if(hiddenInPlay && window.addAlert){
      addAlert('【全图播报】本局出现了隐藏卡「无字天书」——每凑出一张三星，抽中概率都会提升；除机制卡外全部三星后，下一次抽卡必定获得。');
    }
    return hiddenInPlay;
  }

  /* 隐藏卡抽中概率：
   *   基础 0.001%，每凑出一张三星按比例提升
   *   除机制卡外全部三星（20 张）后 → 下一次抽卡必定获得 */
  var TOTAL_NORMAL_CARDS = 20;   // 武将 10 + 神明 10
  function hiddenChance(p){
    if(!window.CNStars || !window.CNStars.threeStarCount) return 0.00001;
    var st = window.CNStars.threeStarCount(p) || 0;
    if(st >= TOTAL_NORMAL_CARDS) return 1;          // 全三星 → 必定
    // 0.001% 线性提升到 ~100%
    var base = 0.00001;                              // 0.001%
    return base + (1 - base) * (st / TOTAL_NORMAL_CARDS);
  }

  function tryDrawHidden(p){
    if(!hiddenInPlay) return false;
    if(hiddenBag) return false;                 // 只存在一张
    var chance = hiddenChance(p);
    if(Math.random() >= chance) return false;
    hiddenBag = true;
    if(window.addAlert) addAlert('【全图播报】'+p.name+' 抽到了隐藏卡「无字天书」！');
    return true;
  }

  /* 使用隐藏卡：把指定卡直升三星 */
  function useHidden(p, cardName){
    if(!hiddenBag) return;
    hiddenBag = false;
    // 找到对应的卡对象，供三星效果结算
    var cardObj = null;
    WARRIORS.concat(GODS).forEach(function(c){ if(c.name === cardName) cardObj = c; });
    if(window.CNStars && window.CNStars.forceThree){
      window.CNStars.forceThree(p, cardName, cardObj);
    }
  }

  function hiddenState(){ return { inPlay: hiddenInPlay, held: hiddenBag }; }

  function repeatLast(p){
    if(!lastCard){ gain(p, 20000); return; }
    try { lastCard.fn(p); } catch(e){}
    addAlert('【复制】'+p.name+' 复制了上一张卡：'+lastCard.name);
  }
  function halveOne(p){
    var o=opponents(p); if(!o.length){ gain(p,10000); return; }
    var t=o[rnd(o.length)]; var cut=Math.round(t.money*0.5);
    t.money-=cut; addAlert('【随机】'+p.name+' 抽中 '+t.name+'，该对手现金减半（-$'+cut+'）。');
  }

  /* ---------- 工具函数 ---------- */
  function opponents(p){
    var me = player.indexOf(p), list=[];
    for(var i=1;i<=pcount;i++){ if(i!==me && player[i] && player[i].money>0) list.push(player[i]); }
    return list;
  }
  function rnd(n){ return Math.floor(Math.random()*n); }
  /* 2026-10-18（老爹定 v23）：卡片金额改成「固定价 + 百分比」
   * 实际金额 = 固定值 + 当前现金 × 比例
   * 后期膨胀得厉害，但扣得也厉害 —— 等于没有膨胀 */
  var PCT_IN = 0.10;      // 自身获得
  var PCT_OUT = 0.05;     // 自身失去
  var PCT_FROM = 0.08;    // 从单个对手拿

  // noBonus=true → 不再额外叠加「现金百分比」（供本身就是百分比效果的卡使用，防重复叠加）
  function gain(p,v,noBonus){
    var _base = window.cashBase ? window.cashBase(p) : p.money;
    var bonus = noBonus ? 0 : Math.round(_base * PCT_IN);
    var amt = (v + bonus) * (window.__STAR_MULT||1);
    // 2026-10-18：奇遇·财神眷顾——现金类收益 +20%
    if(window.Encounter && window.Encounter.gainMultiplier){ amt = Math.round(amt * window.Encounter.gainMultiplier()); }
    p.money += amt;
    addAlert(p.name + ' 获得 $' + amt + '。');
  }
  function lose(p,v,noBonus){
    var _base = window.cashBase ? window.cashBase(p) : p.money;
    var bonus = noBonus ? 0 : Math.round(_base * PCT_OUT);
    var amt = Math.min(v + bonus, p.money) * (window.__STAR_MULT||1);
    p.money -= amt;
    addAlert(p.name + ' 失去 $' + amt + '。');
  }
  function allOpponents(p,fn){ var o=opponents(p); for(var i=0;i<o.length;i++) fn(o[i]); }
  function stealProperty(p){
    // 2026-10-18 放宽：盖了房/旅馆的地也能夺（连建筑一起抢过来）
    var me=player.indexOf(p), cand=[];
    for(var i=0;i<square.length;i++){
      var s=square[i];
      if(s.owner>0 && s.owner!==me && s.price>0) cand.push(s);
    }
    if(!cand.length){ gain(p,8000); return; }
    var t=cand[rnd(cand.length)];
    var ownerName = player[t.owner] ? player[t.owner].name : '某对手';
    var extra = (t.hotel ? '（含旅馆）' : (t.house>0 ? '（含 '+t.house+' 栋房）' : ''));
    t.owner = me;
    addAlert('【随机】'+p.name+' 抽中 '+ownerName+'，夺取了该对手的 '+t.name+extra+'。');
  }
  var GANG3 = {
    '天魁星': { title:'【及时雨】全场每人向你进贡当前现金的 5%', fn:function(p){ var t=0; for(var i=1;i<=pcount;i++){ if(i===player.indexOf(p)) continue; var g=Math.round(player[i].money*0.05); player[i].money-=g; t+=g; } p.money+=t; addAlert('【及时雨】'+p.name+' 收得全场进贡 $'+t+'。'); } },
    '天罡星': { title:'【玉麒麟】永久免过路费，并立即获得现金的 50%', fn:function(p){ p.starFreeRent=(p.starFreeRent||0)+99; gain(p, Math.round(p.money*0.5), true); } },
    '天机星': { title:'【智多星】连续再掷 3 次骰子', fn:function(p){ p.starExtraRoll=(p.starExtraRoll||0)+3; } },
    '天闲星': { title:'【入云龙】传送到最贵的无主地并免费获得', fn:function(p){ freeBest(p); } },
    '天勇星': { title:'【大刀】强制以原价一半买下当前地标', fn:function(p){ if(typeof square!=='undefined' && square[p.position] && square[p.position].price>0 && square[p.position].owner===0){ var q=square[p.position]; p.money-=Math.round(q.price*0.5); q.owner=player.indexOf(p); updateOwned(); addAlert('【大刀】半价拿下 '+q.name+'。'); } else { gain(p,15000); } } },
    '天雄星': { title:'【豹子头】所有对手各向你支付其总资产的 15%', fn:function(p){ allOpponents(p,function(o){ var t=Math.round(o.money*0.15); o.money-=t; p.money+=t; addAlert(o.name+' 向 '+p.name+' 支付 $'+t+'。'); }); } },
    '天猛星': { title:'【霹雳火】摧毁所有对手的全部建筑', fn:function(p){ var me=player.indexOf(p),n=0; for(var i=0;i<square.length;i++){var q=square[i]; if(q.owner>0&&q.owner!==me&&(q.house>0||q.hotel)){q.house=0;q.hotel=0;n++;}} addAlert('【霹雳火】拆掉 '+n+' 处建筑。'); } },
    '天威星': { title:'【双鞭】所有对手现金减半', fn:function(p){ allOpponents(p,function(o){ o.money=Math.round(o.money/2); addAlert(o.name+' 现金减半。'); }); } },
    '天英星': { title:'【小李广】所有对手下回合无法移动', fn:function(p){ allOpponents(p,function(o){ o.starLimitMove=0; o.jail=true; o.jailroll=0; addAlert(o.name+' 被定身入狱。'); }); } },
    '天贵星': { title:'【小旋风】清除自身全部负面并免过路费 10 次', fn:function(p){ p.starIsolate=0;p.starLimitMove=0;p.jail=false;p.starFreeRent=(p.starFreeRent||0)+10; } },
    '天富星': { title:'【扑天雕】立即领取现金的 80%', fn:function(p){ gain(p, Math.round(p.money*0.8), true); } },
    '天满星': { title:'【美髯公】现金补足到全场最高者', fn:function(p){ var mx=0; for(var i=1;i<=pcount;i++){ if(player[i].money>mx) mx=player[i].money; } if(p.money<mx){ addAlert('【美髯公】补足至 $'+mx); p.money=mx; } } },
    '天孤星': { title:'【花和尚】永久免过路费，并夺取一块对手地', fn:function(p){ p.starFreeRent=(p.starFreeRent||0)+99; stealProperty(p); } },
    '天伤星': { title:'【行者】反弹下一次伤害并立即反击随机对手', fn:function(p){ p.starReflect=(p.starReflect||0)+2; takePercentOne(p,30); } },
    '天立星': { title:'【双枪将】连续再掷 2 次骰子', fn:function(p){ p.starExtraRoll=(p.starExtraRoll||0)+2; } },
    '天捷星': { title:'【没羽箭】随机两名对手进监狱', fn:function(p){ var o=opponents(p); if(!o.length){gain(p,10000);return;} for(var k=0;k<Math.min(2,o.length);k++){ o[k].jail=true;o[k].jailroll=0; addAlert(o[k].name+' 被抓进监狱。'); } } },
    '天暗星': { title:'【青面兽】下回合骰子点数 ×3', fn:function(p){ p.starDoubleDice=(p.starDoubleDice||1)*3; } },
    '天佑星': { title:'【金枪手】免死 3 次，并在破产时保留 50% 资产', fn:function(p){ p.starBankruptShield=(p.starBankruptShield||0)+3; } },
    '天空星': { title:'【急先锋】前进 30 格', fn:function(p){ move(p,30); } },
    '天速星': { title:'【神行太保】连续再掷 3 次骰子', fn:function(p){ p.starExtraRoll=(p.starExtraRoll||0)+3; } },
    '天异星': { title:'【赤发鬼】每名对手各被偷走 25% 现金', fn:function(p){ allOpponents(p,function(o){ var t=Math.round(o.money*0.25); o.money-=t; p.money+=t; addAlert(o.name+' 被偷 $'+t+'。'); }); } },
    '天杀星': { title:'【黑旋风】所有对手全部进监狱', fn:function(p){ allOpponents(p,function(o){ o.jail=true; o.jailroll=0; addAlert(o.name+' 被送进监狱。'); }); } },
    '天微星': { title:'【九纹龙】所有对手失去全部免罪道具，并各扣 25% 现金', fn:function(p){ allOpponents(p,function(o){ o.starJailCard=0; o.starFreeRent=0; var t=Math.round(o.money*0.25); o.money-=t; addAlert(o.name+' 被缴械并损失 $'+t+'。'); }); } },
    '天究星': { title:'【没遮拦】每有一块无主地，领取现金的 5%', fn:function(p){ var n=0; for(var i=0;i<square.length;i++){ if(square[i].price>0 && square[i].owner===0) n++; } gain(p, Math.round(p.money*0.05*n), true); } },
    '天退星': { title:'【插翅虎】后退 5 格并领取 20000', fn:function(p){ move(p,-5); gain(p,20000); } },
    '天寿星': { title:'【混江龙】下回合骰子点数 ×3', fn:function(p){ p.starDoubleDice=(p.starDoubleDice||1)*3; } },
    '天剑星': { title:'【立地太岁】永久免过路费', fn:function(p){ p.starFreeRent=(p.starFreeRent||0)+99; } },
    '天平星': { title:'【船火儿】全场现金平均化，并额外领取 10%', fn:function(p){ var t=0,c=0; for(var i=1;i<=pcount;i++){t+=player[i].money;c++;} var avg=Math.round(t/c); for(var j=1;j<=pcount;j++){player[j].money=avg;} gain(p, Math.round(avg*0.1), true); } },
    '天罪星': { title:'【活阎罗】获得永久免过路费', fn:function(p){ p.starFreeRent=(p.starFreeRent||0)+99; } },
    '天损星': { title:'【浪里白条】免疫接下来 3 次伤害', fn:function(p){ p.starShield=(p.starShield||0)+3; } },
    '天败星': { title:'【活阎罗·绝地】立即补足到全场最高现金', fn:function(p){ var mx=0; for(var i=1;i<=pcount;i++){ if(player[i].money>mx) mx=player[i].money; } if(p.money<mx){ p.money=mx; addAlert('【绝地】补足至 $'+mx); } } },
    '天牢星': { title:'【两头蛇】随机一名对手直接进监狱', fn:function(p){ jailOne(p); } },
    '天慧星': { title:'【双尾蝎】免费升级自有地标 3 级，每级再领 10000', fn:function(p){ var me=player.indexOf(p), got=false; for(var i=0;i<square.length;i++){ var q=square[i]; if(q.owner===me&&q.price>0){ if(q.house<4) q.house++; else if(q.house===4&&!q.hotel) q.hotel=1; updateOwned(); got=true; break; } } gain(p, got?30000:20000); } },
    '天暴星': { title:'【浪子】夺取所有对手各一块地', fn:function(p){ allSteal(p); } },
    '天哭星': { title:'【神机军师】破产免责，并保留 100% 资产', fn:function(p){ p.starBankruptShield=(p.starBankruptShield||0)+1; } },
    '天巧星': { title:'【拼命三郎】免费升级自有地标 2 级，并领取现金 30%', fn:function(p){ var me=player.indexOf(p); for(var i=0;i<square.length;i++){ var q=square[i]; if(q.owner===me&&q.price>0){ for(var k=0;k<2;k++){ if(q.house<4) q.house++; else if(q.house===4&&!q.hotel) q.hotel=1; } updateOwned(); break; } } gain(p, Math.round(p.money*0.3), true); } }
  };

  /* 关羽三星：所有对手各被夺走一块地 */
  function allSteal(p){
    var me = player.indexOf(p), got = 0;
    for(var i=1;i<=pcount;i++){
      if(i === me) continue;
      var cand = [];
      for(var k=0;k<square.length;k++){
        var q = square[k];
        if(q.owner === i && q.price > 0) cand.push(q);
      }
      if(cand.length){
        var pick = cand[rnd(cand.length)];
        pick.owner = me; got++;
        addAlert('【武圣】夺取了 '+player[i].name+' 的 '+pick.name+'。');
      }
    }
    if(!got){ gain(p, 10000); }
  }

  /* 龙王三星：免费获得最贵的无主地 */
  function freeBest(p){
    var best = null;
    for(var i=0;i<square.length;i++){
      var q = square[i];
      if(q.price > 0 && q.owner === 0 && (!best || q.price > best.price)) best = q;
    }
    if(!best){ gain(p, 15000); return; }
    best.owner = player.indexOf(p);
    updateOwned();
    addAlert('【龙宫赐福】'+p.name+' 免费获得了最贵的无主地 '+best.name+'。');
  }

  function takeFromOne(p,v){
    var o=opponents(p); if(!o.length){ gain(p,5000); return; }
    var t=o[rnd(o.length)];
    var _tb = window.cashBase ? window.cashBase(t) : t.money;
    var base=Math.min(v + Math.round(_tb * PCT_FROM), t.money);
    var amt=Math.min(base * (window.__STAR_MULT||1), t.money);
    t.money-=amt; p.money+=amt; addAlert('【随机】'+p.name+' 抽中 '+t.name+'，'+t.name+' 向 '+p.name+' 支付了 $'+amt+'。');
  }
  function takePercentOne(p,pct){
    var o=opponents(p); if(!o.length){ gain(p,5000); return; }
    var t=o[rnd(o.length)];
    var amt=Math.min(Math.round(t.money*pct/100) * (window.__STAR_MULT||1), t.money);
    t.money-=amt; p.money+=amt; addAlert('【随机】'+p.name+' 抽中 '+t.name+'，夺走该对手 $'+amt+'。');
  }
  function demolishOne(p){
    // 2026-10-18 放宽：优先拆有建筑的地；无建筑时改为打劫现金
    var me=player.indexOf(p), cand=[], anyProp=[];
    for(var i=0;i<square.length;i++){
      var s=square[i];
      if(s.owner>0 && s.owner!==me){
        if(s.house>0 || s.hotel) cand.push(s);
        if(s.price>0) anyProp.push(s);
      }
    }
    if(cand.length){
      var t=cand[rnd(cand.length)];
      var ownerName = player[t.owner] ? player[t.owner].name : '某对手';
      var what = t.hotel ? '旅馆' : (t.house+' 栋房子');
      t.house=0; t.hotel=0;
      updateOwned();
      addAlert('【随机】'+p.name+' 抽中 '+ownerName+'，拆掉了 '+t.name+' 上的 '+what+'。');
      return;
    }
    if(anyProp.length){
      var t2 = anyProp[rnd(anyProp.length)];
      var ownerName2 = player[t2.owner] ? player[t2.owner].name : '某对手';
      addAlert('【随机】'+p.name+' 抽中 '+ownerName2+' 的 '+t2.name+'，但上头没建筑可拆，改为索取补偿。');
      gain(p, 6000);
      return;
    }
    gain(p,6000);
  }
  function move(p,n){ p.position=(p.position+n)%40; updatePosition(); addAlert(p.name+' 前进 '+n+' 格。'); }
  function jailOne(p){
    var o=opponents(p); if(!o.length){ gain(p,600); return; }
    var t=o[rnd(o.length)]; t.jail=true; t.jailroll=0; addAlert('【随机】'+p.name+' 抽中 '+t.name+'，该对手被抓进监狱。');
  }
  function balanceOne(p){
    var o=opponents(p); if(!o.length){ gain(p,400); return; }
    var t=o[rnd(o.length)], avg=Math.round((p.money+t.money)/2);
    p.money=avg; t.money=avg; addAlert('【随机】'+p.name+' 抽中 '+t.name+'，两人平分了现金。');
  }
  function teleportFree(p){
    var free=[]; for(var i=0;i<square.length;i++){ if(square[i].price>0 && square[i].owner===0) free.push(i); }
    if(!free.length){ gain(p,5000); return; }
    p.position=free[rnd(free.length)]; updatePosition(); addAlert(p.name+' 被传送到 '+square[p.position].name+'。');
  }

  /* ---------- 弹窗 ---------- */
  function showCard(card, kind, p, after){
    var isWar = kind==='war';
    var isMech = kind==='mech';
    var isHidden = kind==='hidden';
    var accent = isHidden ? '#ff5a8a' : (isMech ? '#c9a961' : (isWar ? '#ff9a4a' : '#9fe0ff'));
    var bg = isHidden ? 'linear-gradient(160deg,#2a0a18 0%,#12040a 100%)' : (isMech ? 'linear-gradient(160deg,#241c16 0%,#12100c 100%)' : (isWar ? 'linear-gradient(160deg,#2a1408 0%,#0d0704 100%)' : 'linear-gradient(160deg,#08181f 0%,#04101a 100%)'));
    var border = isHidden ? '#a83232' : (isMech ? '#8a7040' : (isWar ? '#8a5010' : '#1e5a7a'));

    var html =
      '<div style="padding:18px 18px 12px;text-align:center">' +
        '<div style="font-size:11px;letter-spacing:4px;color:'+accent+';opacity:.8;margin-bottom:10px">'+(isHidden?'隐藏卡降临':(isMech?'机制降临':(isWar?'武将降临':'神明降临')))+'</div>' +
        '<div style="font-size:32px;line-height:1;margin-bottom:8px">'+card.icon+'</div>' +
        '<div style="font-size:24px;font-weight:900;color:'+accent+';letter-spacing:3px;text-shadow:0 0 18px '+accent+'55">'+card.name+'</div>' +
        '<div style="font-size:12px;color:'+accent+';opacity:.7;margin-top:5px;letter-spacing:1px">'+card.title+'</div>' +
        '<div style="height:1px;background:linear-gradient(90deg,transparent,'+accent+'66,transparent);margin:14px 0 12px"></div>' +
        '<div style="font-size:14px;color:#e8dcc8;line-height:1.8;padding:0 2px">'+card.text+'</div>' +
      '</div>' +
      '<button class="star-btn" id="cncardbtn" style="background:linear-gradient(160deg,'+accent+',#c07a20);color:#1a1208">收 下</button>';

    var P = document.getElementById('popup');
    var txt = document.getElementById('popuptext');
    txt.innerHTML = html;
    P.className='star-popup';
    P.style.width='300px'; P.style.minWidth='300px'; P.style.padding='0';
    P.style.background=bg; P.style.borderColor=border;

    var wrap=document.getElementById('popupwrap');
    var bgel=document.getElementById('popupbackground');
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

  /* ---------- 卡袋界面：手动查看 + 手动使用 ---------- */
  function openBag(p){
    if(!p){ return; }
    if(!p.human){ popup('<div style="text-align:center;padding:10px">机制卡袋只能由人类玩家操作。</div>'); return; }
    var bag = bagOf(p);
    var rows = '';
    if(!bag.length){
      rows = '<div style="text-align:center;color:#7a6a52;font-size:13px;padding:18px 0">卡袋空空如也<br><span style="font-size:11px">抽到机制卡会自动存入这里</span></div>';
    } else {
      var count = {};
      bag.forEach(function(n){ count[n] = (count[n]||0)+1; });
      Object.keys(count).forEach(function(n, i){
        var card = null;
        MECHA.forEach(function(c){ if(c.name===n) card=c; });
        if(!card) return;
        rows += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;margin-bottom:6px;background:#1a1410;border:1px solid #4a3f30;border-radius:9px">' +
          '<span style="font-size:13px;color:#e8dcc8">'+card.icon+' '+card.name+' <b style="color:#c9a961">×'+count[n]+'</b></span>' +
          '<button class="star-btn" style="width:auto;margin:0;padding:7px 14px;font-size:12px" onclick="CNCards.useFromBag(\''+n+'\', player[turn])">使 用</button>' +
        '</div>';
      });
    }
    var total = mechRemaining();
    // 隐藏卡：持有中则显示
    if(hiddenBag){
      rows += '<div style="padding:10px;margin-bottom:6px;background:#2a0a18;border:1px solid #a83232;border-radius:9px;text-align:center">' +
        '<div style="font-size:13px;color:#ff9aab;margin-bottom:6px">📜 无字天书 <b>×1</b></div>' +
        '<div style="font-size:10px;color:#8a6070;margin-bottom:8px">使用后指定一张卡直升三星</div>' +
        '<button class="star-btn" style="width:auto;margin:0 auto;padding:7px 16px;font-size:12px;background:linear-gradient(160deg,#ff5a8a,#8a2438);color:#fff" onclick="CNCards.openHiddenPicker(player[turn])">使 用</button>' +
      '</div>';
    }

    var html =
      '<div style="padding:16px 14px 10px">' +
        '<div style="text-align:center;font-size:15px;font-weight:900;color:#c9a961;letter-spacing:3px;margin-bottom:4px">🎴 机制卡袋</div>' +
        '<div style="text-align:center;font-size:10.5px;color:#7a6a52;margin-bottom:12px">全服机制卡剩余 '+total+' 张 · 使用后立刻生效</div>' +
        rows +
      '</div>' +
      '<button class="star-btn" style="background:linear-gradient(160deg,#2a2219,#1a1410);color:#ddd2b8;border:1px solid #5a4f3a" onclick="document.getElementById(\'popupbackground\').style.display=\'none\';document.getElementById(\'popupwrap\').style.display=\'none\';document.getElementById(\'popup\').className=\'\';document.getElementById(\'popup\').style.background=\'\';">关 闭</button>';

    var P=document.getElementById('popup'), txt=document.getElementById('popuptext');
    txt.innerHTML = html;
    P.className='star-popup';
    P.style.width='320px'; P.style.minWidth='320px'; P.style.padding='0';
    P.style.background='linear-gradient(160deg,#241c16 0%,#12100c 100%)';
    P.style.borderColor='#8a7040';
    var wrap=document.getElementById('popupwrap'), bgel=document.getElementById('popupbackground');
    if(bgel) bgel.style.display='block';
    wrap.style.display='block';
  }

  function useFromBag(name, p){
    var bag = bagOf(p);
    var idx = bag.indexOf(name);
    if(idx < 0){ return; }
    var card = null;
    MECHA.forEach(function(c){ if(c.name===name) card=c; });
    if(!card){ return; }
    bag.splice(idx, 1);                    // 从卡袋移除
    try { card.fn(p); } catch(e){ console.warn('[使用机制卡]', e); }
    updateMoney(); updateOwned(); updatePosition();
    if(window.addAlert) addAlert('【使用】'+p.name+' 使用了机制卡「'+name+'」。');
    showCard(card, 'mech', p, null);
  }

  /* 隐藏卡：选择要把哪张卡升到三星 */
  function openHiddenPicker(p){
    if(!hiddenBag){ return; }
    if(!window.CNStars || !window.CNStars.deckOf){ return; }
    var d = window.CNStars.deckOf(p);
    var rows = '';
    var names = Object.keys(d).filter(function(n){ return d[n] > 0 && d[n] < 9; });
    if(!names.length){
      rows = '<div style="text-align:center;color:#7a6a52;font-size:13px;padding:18px 0">没有可升星的卡<br><span style="font-size:11px">（要么还没抽到卡，要么都已经三星了）</span></div>';
    } else {
      names.forEach(function(n){
        var card = null;
        WARRIORS.concat(GODS).forEach(function(c){ if(c.name===n) card=c; });
        if(!card) return;
        rows += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;margin-bottom:6px;background:#1a1410;border:1px solid #4a3f30;border-radius:9px">' +
          '<span style="font-size:13px;color:#e8dcc8">'+card.icon+' '+n+' <b style="color:#c9a961">'+d[n]+'/9</b></span>' +
          '<button class="star-btn" style="width:auto;margin:0;padding:7px 14px;font-size:12px;background:linear-gradient(160deg,#ff5a8a,#8a2438);color:#fff" onclick="CNCards.useHidden(player[turn], \''+n+'\')">升三星</button>' +
        '</div>';
      });
    }
    var html =
      '<div style="padding:16px 14px 10px">' +
        '<div style="text-align:center;font-size:15px;font-weight:900;color:#ff9aab;letter-spacing:3px;margin-bottom:4px">📜 无字天书</div>' +
        '<div style="text-align:center;font-size:10.5px;color:#8a6070;margin-bottom:12px">选择一张卡，立刻升至三星</div>' +
        rows +
      '</div>' +
      '<button class="star-btn" style="background:linear-gradient(160deg,#2a2219,#1a1410);color:#ddd2b8;border:1px solid #5a4f3a" onclick="document.getElementById(\'popupbackground\').style.display=\'none\';document.getElementById(\'popupwrap\').style.display=\'none\';document.getElementById(\'popup\').className=\'\';">取 消</button>';

    var P=document.getElementById('popup'), txt=document.getElementById('popuptext');
    txt.innerHTML = html;
    P.className='star-popup';
    P.style.width='320px'; P.style.minWidth='320px'; P.style.padding='0';
    P.style.background='linear-gradient(160deg,#2a0a18 0%,#12040a 100%)';
    P.style.borderColor='#a83232';
    var wrap=document.getElementById('popupwrap'), bgel=document.getElementById('popupbackground');
    if(bgel) bgel.style.display='block';
    wrap.style.display='block';
  }

  /* ============================================================
   * 2026-10-18：主动买牌（参考金铲铲商店）
   *   地煞 40,000 / 张、天罡 50,000 / 张
   *   每次开商店随机刷 5 张，可自己挑着买
   * ============================================================ */
  /* 2026-10-18 金币体系：1 金币 = 10,000 现金 */
  var COIN_VALUE = 10000;
  var BUY_COINS = { di: 4, gang: 5 };            // 地煞 4 金币，天罡/神明/武将 5 金币
  var REFRESH_COINS = 1;                          // 刷新 1 金币
  var LEVEL_COST = [0, 10, 30, 50, 70, 90, 110, 130];  // 升到 2..8 级

  /* 商店等级 → 各类型出现权重 */
  var LEVEL_WEIGHTS = {
    1: { di:70, gang:25, god:4, war:1 },
    2: { di:60, gang:30, god:7, war:3 },
    3: { di:50, gang:33, god:11, war:6 },
    4: { di:40, gang:35, god:15, war:10 },
    5: { di:30, gang:35, god:19, war:16 },
    6: { di:20, gang:33, god:25, war:22 },
    7: { di:10, gang:30, god:30, war:30 },
    8: { di:0,  gang:25, god:37, war:38 }
  };

  function openBuy(p){
    if(!p){ return; }
    if(!p.human){ popup('<div style="text-align:center;padding:10px">买牌只能由人类玩家操作。</div>'); return; }
    if(!window.CNStars){ popup('<div style="text-align:center;padding:10px">升星引擎没加载，买不了。</div>'); return; }
    if(!window.StarEngine || !window.StarEngine.load){
      popup('<div style="text-align:center;padding:10px">星宿引擎没加载，买不了。</div>'); return;
    }
    window.StarEngine.load(function(){
      var pool = window.StarEngine.stars ? window.StarEngine.stars() : null;
      if(!pool || !pool.length){
        popup('<div style="text-align:center;padding:10px">星宿数据没取到，稍后再试。</div>'); return;
      }
      // 2026-10-18 老爹定：打开商店「不自动刷新」——货架保持不动，
      // 否则关掉再开就能白嫖一次刷新，花钱刷新按钮就没意义了
      // 只有第一次（本局还没刷过货架）或换人时才生成
      var needRoll = !window.__BUY_SALE || !window.__BUY_SALE.length ||
                     window.__BUY_SALE_OWNER !== player.indexOf(p);
      if(needRoll){
        rollShop(p, pool);
        window.__BUY_SALE_OWNER = player.indexOf(p);
      }
      showBuyShop(p, pool);
    });
  }

  /* 按当前等级权重，随机刷 5 张 */
  function rollShop(p, allStars){
    var lv = Math.min(8, Math.max(1, p.shopLevel || 1));
    var w = LEVEL_WEIGHTS[lv] || LEVEL_WEIGHTS[1];
    // 2026-10-18：星枢引曜（赐福）——天罡权重 ×1.2
    if(window.Boon && window.Boon.adjustWeights){ w = window.Boon.adjustWeights(p, w); }
    // 2026-10-18：奇遇·群星璀璨——天罡权重 ×1.5
    if(window.Encounter && window.Encounter.boostGangWeight){ w = window.Encounter.boostGangWeight(w); }
    var buckets = {
      di:   allStars.filter(function(s){ return s.type==='di'; }),
      gang: allStars.filter(function(s){ return s.type==='gang'; }),
      god:  GODS,
      war:  WARRIORS
    };
    var sale = [];
    for(var i=0;i<5;i++){
      var total = w.di + w.gang + w.god + w.war;
      var r = Math.random() * total, pick = 'di';
      if((r -= w.di) < 0) pick = 'di';
      else if((r -= w.gang) < 0) pick = 'gang';
      else if((r -= w.god) < 0) pick = 'god';
      else pick = 'war';
      var arr = buckets[pick];
      if(!arr || !arr.length){ arr = buckets.di; }
      var item = arr[rnd(arr.length)];
      sale.push({ data: item, kind: (pick==='di'||pick==='gang') ? pick : 'card' });
    }
    window.__BUY_SALE = sale;
    return sale;
  }

  /* 2026-10-18：卡牌效果说明（商店 / 弹窗共用）
   * 优先级：card.text > GANG3.title > 引擎描述 > 兜底 */
  function effectText(st, kind){
    if(!st) return '（无描述）';
    if(st.text) return st.text;
    if(st.title && kind !== 'di') return st.title;
    if(kind === 'gang' && GANG3[st.name]) return GANG3[st.name].title;
    if(st.desc) return st.desc;
    if(st.name) return '【'+st.name+'】按星宿原效果结算';
    return '（无描述）';
  }

  function showBuyShop(p, allStars){
    var sale = window.__BUY_SALE || [];
    var lv = Math.min(8, Math.max(1, p.shopLevel || 1));
    var nextCost = (lv < 8) ? LEVEL_COST[lv] : null;
    // 2026-10-18：拔苗助长——按钮上显示的价也要跟着减
    if(nextCost !== null && window.Boon && window.Boon.discountUpgrade){ nextCost = window.Boon.discountUpgrade(p, nextCost); }

    var rows = '';
    sale.forEach(function(it, i){
      var st = it.data;
      var kind = it.kind;
      var price = (kind === 'di') ? BUY_COINS.di : BUY_COINS.gang;
      var cnt = 0, star = 1;
      if(kind === 'card'){
        cnt = CNStars.deckOf(p)[st.name] || 0;
        star = CNStars.starOf(cnt);
      } else {
        cnt = CNStars.deckOf(p)[st.name] || 0;
        star = CNStars.starOf(cnt);
      }
      var stars = '';
      for(var k=0;k<4;k++){ stars += (k<star?'★':'☆'); }
      var label = (kind==='di') ? '地煞' : (kind==='gang') ? '天罡' : (kind==='god' ? '神明' : '武将');
      var accent = (kind==='di') ? '#9fe0ff' : (kind==='gang') ? '#ffd86a' : (kind==='god') ? '#c9a961' : '#ff9a4a';
      rows += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;margin-bottom:6px;background:#1a1410;border:1px solid '+(kind==='di'?'#2e4a63':'#8a7040')+';border-radius:9px">' +
        '<span style="font-size:12.5px;color:'+accent+';flex:1">'+label+'<br><b>'+st.name+'</b> <span style="font-size:10px;color:#8a7f68">'+stars+' '+cnt+'/9</span>' +
          '<div style="font-size:10px;color:#9a8f78;line-height:1.5;margin-top:3px">'+effectText(st, kind)+'</div></span>' +
        '<button class="star-btn" style="width:auto;margin:0;padding:7px 12px;font-size:11.5px" onclick="CNCards.buyOne('+i+', player[turn])">'+price+'金</button>' +
      '</div>';
    });

    var html =
      '<div style="padding:16px 14px 10px">' +
        '<div style="text-align:center;font-size:15px;font-weight:900;color:#c9a961;letter-spacing:3px;margin-bottom:2px">🛒 星宿商店</div>' +
        '<div style="text-align:center;font-size:11px;color:#8a7f68;margin-bottom:8px">金币 '+((p.coins||0))+' · 现金 '+(window.fmtMoney?fmtMoney(p.money):p.money)+' · 等级 '+lv+'</div>' +
        rows +
        '<div style="display:flex;gap:6px;margin-top:8px">' +
          '<button class="star-btn" style="flex:1;margin:0;padding:9px;font-size:12px" onclick="CNCards.refreshShop(player[turn])">🔄 刷新 1金</button>' +
          (nextCost !== null ? '<button class="star-btn" style="flex:1;margin:0;padding:9px;font-size:12px;background:linear-gradient(160deg,#c9a961,#8a6f30)" onclick="CNCards.upgradeLevel(player[turn])">⬆ 升'+(lv+1)+'级 '+nextCost+'金</button>' : '<button class="star-btn" style="flex:1;margin:0;padding:9px;font-size:12px;opacity:.45">已满级</button>') +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
          '<button class="star-btn" style="flex:1;margin:0;padding:9px;font-size:11.5px;background:linear-gradient(160deg,#2a2219,#1a1410);color:#ddd2b8;border:1px solid #5a4f3a" onclick="CNCards.exchangeCoin(player[turn],1)">1万 → 1金</button>' +
          '<button class="star-btn" style="flex:1;margin:0;padding:9px;font-size:11.5px;background:linear-gradient(160deg,#2a2219,#1a1410);color:#ddd2b8;border:1px solid #5a4f3a" onclick="CNCards.exchangeCoin(player[turn],-1)">1金 → 1万</button>' +
        '</div>' +
      '</div>' +
      '<button class="star-btn" style="background:linear-gradient(160deg,#2a2219,#1a1410);color:#ddd2b8;border:1px solid #5a4f3a" onclick="document.getElementById(\'popupbackground\').style.display=\'none\';document.getElementById(\'popupwrap\').style.display=\'none\';document.getElementById(\'popup\').className=\'\';document.getElementById(\'popup\').style.background=\'\';">关 闭</button>';

    var P=document.getElementById('popup'), txt=document.getElementById('popuptext');
    txt.innerHTML = html;
    P.className='star-popup';
    P.style.width='340px'; P.style.minWidth='340px'; P.style.padding='0';
    P.style.background='linear-gradient(160deg,#241c16 0%,#12100c 100%)';
    P.style.borderColor='#8a7040';
    var wrap=document.getElementById('popupwrap'), bgel=document.getElementById('popupbackground');
    if(bgel) bgel.style.display='block';
    wrap.style.display='block';
  }

  function refreshShop(p){
    // 2026-10-18：奇遇·风调雨顺——刷新免费
    var freeRefresh = (window.Encounter && window.Encounter.freeRefresh && window.Encounter.freeRefresh());
    if(!freeRefresh && (p.coins||0) < REFRESH_COINS){
      popup('<div style="text-align:center;padding:10px">金币不够，刷新要 '+REFRESH_COINS+' 金币。</div>');
      return;
    }
    if(!freeRefresh){ p.coins -= REFRESH_COINS; }
    addAlert('【商店】'+p.name+(freeRefresh?' 免费刷新了商店（奇遇·风调雨顺）。':' 花了 '+REFRESH_COINS+' 金币刷新商店。'));
    updateMoney();
    rollShop(p, window.StarEngine.stars());
    window.__BUY_SALE_OWNER = player.indexOf(p);
    showBuyShop(p, window.StarEngine.stars());
  }

  function upgradeLevel(p){
    var lv = Math.min(8, Math.max(1, p.shopLevel || 1));
    if(lv >= 8){ return; }
    var cost = LEVEL_COST[lv];
    // 2026-10-18：拔苗助长——升级消耗金币减 10%
    if(window.Boon && window.Boon.discountUpgrade){ cost = window.Boon.discountUpgrade(p, cost); }
    if((p.coins||0) < cost){
      popup('<div style="text-align:center;padding:10px">金币不够，升到 '+(lv+1)+' 级要 '+cost+' 金币。</div>');
      return;
    }
    p.coins -= cost;
    p.shopLevel = lv + 1;
    addAlert('【商店】'+p.name+' 花 '+cost+' 金币升到了 '+p.shopLevel+' 级商店。');
    updateMoney();
    showBuyShop(p, window.StarEngine.stars());
  }

  function buyOne(idx, p){
    var sale = window.__BUY_SALE || [];
    var it = sale[idx];
    if(!it){ return; }
    var st = it.data;
    var kind = it.kind;
    var price = (kind === 'di') ? BUY_COINS.di : BUY_COINS.gang;
    if((p.coins||0) < price){
      popup('<div style="text-align:center;padding:10px">金币不够，'+st.name+' 要 '+price+' 金币。</div>');
      return;
    }
    p.coins -= price;
    addAlert('【买牌】'+p.name+' 花 '+price+' 金币买下了 '+st.name+'。');
    updateMoney();

    document.getElementById('popupbackground').style.display='none';
    document.getElementById('popupwrap').style.display='none';
    document.getElementById('popup').className='';
    document.getElementById('popup').style.background='';

    if(kind === 'card'){
      // 武将 / 神明卡：走升星流程
      CNStars.drawAndApply(p, st, kind);
    } else {
      // 星宿：走升星流程（kind 为 gang/di）
      CNStars.drawAndApply(p, st, kind);
    }
  }

  /* 现金 ↔ 金币（dir=1 现金换金币，dir=-1 金币换现金） */
  function exchangeCoin(p, dir){
    if(dir > 0){
      if(p.money < COIN_VALUE){ popup('<div style="text-align:center;padding:10px">现金不足 1 万，换不了。</div>'); return; }
      p.money -= COIN_VALUE;
      p.coins = (p.coins || 0) + 1;
      addAlert('【兑换】'+p.name+' 用 1 万现金换了 1 金币。');
    } else {
      if((p.coins||0) < 1){ popup('<div style="text-align:center;padding:10px">没有金币可换。</div>'); return; }
      p.coins -= 1;
      p.money += COIN_VALUE;
      addAlert('【兑换】'+p.name+' 用 1 金币换了 1 万现金。');
    }
    updateMoney();
    showBuyShop(p, window.StarEngine.stars());
  }

  /* ---------- 对外：抽取 ---------- */
  function trigger(kind, p, after){
    var pool, card;

    // 2026-10-18：隐藏卡优先判定（0.01%），仅当本局出现了隐藏卡
    if(tryDrawHidden(p)){
      showCard(HIDDEN, 'hidden', p, after);
      return;
    }

    if(kind==='mech'){
      // 只剩还有库存的机制卡
      var avail = MECHA.filter(function(c){
        if(mechLeft[c.name] <= 0) return false;
        if(window.CNStars && window.CNStars.canDrawFor && !window.CNStars.canDrawFor(p, c.name)) return false;
        return true;
      });
      if(!avail.length){ kind = 'war'; }   // 机制卡抽完，退回武将卡
      else {
        card = avail[rnd(avail.length)];
        mechLeft[card.name]--;
        bagOf(p).push(card.name);           // 存入该玩家的卡袋
        // 全服播报
        if(window.addAlert) addAlert('【机制播报】'+p.name+' 抽到了机制卡「'+card.name+'」（全服剩余 '+mechRemaining()+' 张）');
        if(kind==='mech') lastCard = card;
        try { card.fn(p); } catch(e){ console.warn('[机制卡]', e); }
        updateMoney(); updateOwned(); updatePosition();
        showCard(card, 'mech', p, after);
        return;
      }
    }
    // 2026-10-18：三星后「别人绝版、自己不绝版」→ 按玩家判断能否抽到
    var base = (kind==='war') ? WARRIORS : GODS;
    pool = base.filter(function(c){
      return !(window.CNStars && window.CNStars.canDrawFor && !window.CNStars.canDrawFor(p, c.name));
    });
    if(!pool.length){ pool = base; }   // 全绝版兜底，避免抽空
    card = pool[rnd(pool.length)];
    if(kind!=='mech' || card.name!=='复制'){ lastCard = card; }

    // 2026-10-18：只有武将卡、神明卡走升星流程
    // 机制卡每种全局限量 4 张，凑不满三星，不参与升星
    if(window.CNStars && kind !== 'mech'){
      window.CNStars.drawAndApply(p, card, kind);
      if(after) after();
      return;
    }

    try { card.fn(p); } catch(e){ console.warn('[中国版卡片]', e); }
    updateMoney(); updateOwned(); updatePosition();
    showCard(card, kind, p, after);
  }

  window.CNCards = { trigger: trigger, WARRIORS: WARRIORS, GODS: GODS, MECHA: MECHA, HIDDEN: HIDDEN, mechLeft: mechLeft, mechRemaining: mechRemaining, bagOf: bagOf, openBag: openBag, useFromBag: useFromBag, rollHiddenPresence: rollHiddenPresence, tryDrawHidden: tryDrawHidden, useHidden: useHidden, hiddenState: hiddenState, openHiddenPicker: openHiddenPicker, hiddenChance: hiddenChance,
    openBuy: openBuy, buyOne: buyOne, refreshShop: refreshShop, upgradeLevel: upgradeLevel, exchangeCoin: exchangeCoin, gang3: function(name){ var c=GANG3[name]; if(!c) return null; return { title:c.title, run:function(p){ c.fn(p); } }; } };
})();
