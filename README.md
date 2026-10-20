# 🎲 肥鱼 · 玄枢 3D 大富翁

> Three.js 打造的 3D 大富翁，带一套「玄枢」占卜机制——**用哈希算卦，不是随机数**。

![version](https://img.shields.io/badge/version-v1.12.0-blue)
![three.js](https://img.shields.io/badge/three.js-0.182-green)
![vite](https://img.shields.io/badge/vite-7.3-purple)
![license](https://img.shields.io/badge/license-see%20LICENSE-lightgrey)

---

## ✨ 一句话

经典大富翁玩法 + **六种中国传统术数**（六爻 / 塔罗 / 御神签 / 八字 / 大六壬 / 奇门）+ Three.js 3D 棋盘。

**但核心机制不是「抽卡给钱」，而是真算。**

---

## 🔮 玄枢系统（核心设计）

### 不是随机数，是哈希

传统桌游的机会卡是 `Math.random()` 抽的——玩家知道那是骰子，没有分量。

这里换了个做法：

```
抽卡那一刻的毫秒级时间戳
        ↓
     SHA-256 哈希
        ↓
  取字节 → 定卦 / 定签 / 定吉凶
        ↓
   弹出卦象 + 签诗 + 底部显示时间戳与哈希前 16 位
```

**哈希用的是浏览器原生 Web Crypto**，不是手写实现——用标准值（`abc` / `hello world` / 空串）对过，全部一致。

**玩家能自己验证**：弹窗底部就写着那次的哈希前 16 位，想查随时能重现。

### 六法门 × 六吉凶

| 格子类型 | 法门 |
|---|---|
| **机会格** | 六爻 / 塔罗 / 御神签 |
| **命运格** | 八字 / 大六壬 / 奇门 |

| 吉凶档 | 实测分布（5000 次） |
|---|---|
| 大吉 | ~9% |
| 上吉 | ~19% |
| 中吉 | ~30% |
| 小吉 | ~22% |
| 凶 | ~13% |
| 大凶 | ~6% |

吉凶比约 **8:2**——运气好是常态，但翻车也真会翻。

### 三种特色机制

| 机制 | 效果 |
|---|---|
| **☯ 六爻动爻** | 三爻两阳以上 → 下回合掷骰 +2；一阳 → +1；三爻全阴 → −1 |
| **🃏 塔罗逆位** | 抽到逆位挂「逆位护体」→ 下次受创**原数反弹**给出手方 |
| **🌌 奇门八门** | 生门/开门 → 从对手手里**夺一块地**；死门/惊门 → 掷骰减半；伤门 → 禁买地；杜门 → 禁盖房；休门/景门 → 免一次过路费 |

设计原则：**有决策、有连锁、有反转**——不是「抽完就给钱」。

---

## 🧩 关于旧卡牌体系（已关闭，代码保留）

考虑到部分对局节奏与玩家的认知负荷，当前版本在 UI 层**默认关闭**了 108 星宿（天罡地煞）、10 张武将与 10 张神明系统。

> **注**：底层数据引擎与数值逻辑**已全部实现并开源保留**，可通过全局配置开启「硬核修罗场模式」，体验极致的策略压力。

要接回来，打开 `src/compat.js` 里 `loadLegacy()` 中被注释的几行即可：

```js
// src/compat.js -> loadLegacy()
// await import('./legacy/encounter.js');      // 奇遇（6 条，30% 出现）
// await import('./legacy/boon.js');           // 天罡地煞赐福（13 条，全员投票）
// await import('./legacy/stars_engine.js');   // 108 星宿（天罡 36 + 地煞 72）
// await import('./legacy/stars_rank.js');     // 升星 / 核弹 / 绝版
// await import('./legacy/cn_cards.js');       // 武将 10 + 神明 10 + 机制卡 8
// await import('./legacy/cards.js');          // 旧机会 / 命运卡
```

**两套体系并存**：旧卡牌（星宿/武将/神明）与新的玄枢（六法门占卜）互不冲突，
但同时开启会让单局复杂度显著上升——**这就是「硬核修罗场」的含义**。

---

## 🎯 玩法

- **2–5 人**，可全 AI，也可混人对战
- **负债规则**：可以变负债，但负债时什么都干不了（不能买地、不能盖房）；所有收入自动优先还债
- **凑齐同色组 → 自动抽一张命运卡，必定大吉**（玩家与 AI 都生效）
- **AI 五种性格**：精明保守 / 激进派 / 科技新贵 / 老江湖 / 创业萌新

---

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 开发模式（热更新）
npm run dev
# → http://localhost:5180

# 构建生产版本
npm run build
# → 产物在 dist/

# 预览构建结果
npm run preview
```

**依赖只有两个**：`three`（3D 渲染）+ `vite`（构建工具）。没有 UI 框架、没有状态管理库、没有 CSS 预处理器。

---

## 📁 项目结构

```
src/
├── main.js              # 入口
├── app.js               # 应用主逻辑 + UI 绑定
├── game.js              # 游戏核心状态机
├── ai.js                # 五种 AI 性格
├── compat.js            # 旧代码兼容层
├── cheatguard.js        # 现金变动审计（防作弊）
├── audio.js             # 音效（Web Audio，无音频文件）
├── transition.js        # 场景转场
├── three/
│   └── world.js         # Three.js 场景、棋盘、棋子、建筑
├── ui/
│   ├── handUI.js        # 手牌界面
│   └── chromaKey.js     # 绿幕抠像（艺术素材→透明 PNG）
├── data/
│   ├── tiles.js         # 棋盘格定义（地价/租金/分组）
│   └── currency.js      # 货币格式化
└── legacy/
    ├── oracle.js        # 🔮 玄枢核心：SHA-256 占卜
    ├── cn_cards.js      # 武将/神明/机制卡
    ├── boon.js          # 赐福系统
    ├── encounter.js     # 奇遇
    ├── cards.js         # 传统机会/命运卡
    ├── stars_engine.js  # 108 星宿引擎
    └── stars_rank.js    # 升星系统
```

---

## 🛠 技术要点

### 1. 零外部服务

纯静态站点，**没有后端**。所有逻辑在浏览器里跑，状态存在内存中。

### 2. 哈希做占卜

```js
// 时间戳 → SHA-256 → 定卦
const hash = await crypto.subtle.digest('SHA-256', 
  new TextEncoder().encode(String(Date.now()))
);
```

没用伪随机数生成器，因为**伪随机数可以被预测**，而毫秒级时间戳 + SHA-256 让每次抽卡都不可复现、但**可验证**。

### 3. 3D 性能优化

- 分帧建场景（手机不再卡死）
- 合并几何减少 draw call
- 懒加载贴图 + 8 秒超时兜底
- 房屋分阶段长高动画

### 4. 现金审计（cheatguard）

每次玩家现金变动都要登记「来源」（租金 / 卡牌 / 过路费），
无来源的变动会被记录成证据——**给自己看的防作弊工具**。

---

## 📜 第三方素材

**地标图标来自第三方图标包**，来源与许可详见 [`public/textures/landmarks/CREDITS.md`](public/textures/landmarks/CREDITS.md)。

要点：

| 项目 | 内容 |
|---|---|
| 图标包 | Famous architecture Icon Pack |
| 作者 | hide-best |
| 网站 | VeryIcon |
| 站点声明许可 | `Free for personal and commercial purpose.` |

⚠️ **诚实说明**：这是**站点自行声明**的「个人及商业用途免费」，**并非 MIT / CC0 等标准开源许可**。
已抓取来源页全页截图留档（2026-10-17）。若原作者后续调整授权，以来源页当时内容为准。

本项目**不以售卖图标本身获利**，仅作为游戏界面组成部分使用。

其余代码（`src/` 全部、`index.html`、构建配置）为本项目原创。

---

## 🎮 关于

- 游戏本体移植自 [intrepidcoder/monopoly](https://github.com/intrepidcoder/monopoly)（MIT 许可）
- 玄枢系统、AI 性格、3D 场景、卡片系统为后续独立开发
- 版本号采用语义化版本（主.次.修订）

---

## 📄 License

见 [LICENSE](LICENSE)。第三方素材许可见上述 CREDITS。
