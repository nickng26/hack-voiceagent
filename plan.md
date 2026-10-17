# TrailBuddy —— 登山语音 AI 搭子

> 项目计划书 · 2026-10-17
> 基于 LiveKit Agents 的免提语音伴侣，让登山者戴着耳机就能完成陪聊、进度追踪和紧急求助。

---

## 1. 项目目的

**一句话**：让登山者**不用掏手机、不用看屏幕**，只靠耳机和说话，就能知道自己走到哪了、还有多远，并在出事时快速把位置送到该去的人手里。

**要解决的真实痛点：**

| 痛点 | 现状 | TrailBuddy 的做法 |
|---|---|---|
| 想知道进度就得停下掏手机 | 手套、下雨、手冷时根本没法操作 | 直接问一句"还有多远" |
| 一个人爬山很无聊 | 听播客没法互动 | 能聊天、能记录见闻 |
| 出事时说不清自己在哪 | 慌乱中报不出坐标 | agent 自动播报救援级坐标 + 一键通知联系人 |
| 没人知道你多久没动了 | 失联后很晚才被发现 | 长时间无响应时主动询问 |

**不是什么**：不是导航 app（Gaia/AllTrails 做得更好），不是社交平台。它是一个**语音优先的陪伴 + 安全层**，叠在你已有的登山工具之上。

---

## 2. 核心使用场景

演示时要跑通的完整故事：

```
1. 出发   "我要去爬 Eagle Peak"        → 建 hike 记录，拉路线
3. 查进度 "我走了多久了？"              → 已走 2h47m / 剩 3.2km / 预计 55 分钟
4. 记录   "记一下，这儿有熊的脚印"      → 存进笔记，带当前坐标
5. 出事   "我崴到脚了，走不动了"        → 交接给紧急 agent
6. 求助   agent 播报坐标 + 海拔         → 发短信给紧急联系人（含地图链接）
7. 解除   "其实还能走，没事了"          → 交接回闲聊 agent
```

---

## 3. 功能清单

### 3.1 闲聊陪伴（P0）

- 自然对话，不需要唤醒词
- 回复控制在 1-3 句（省 TTS 费用，也更像真人）
- 长时间沉默后主动关心（靠 `user_away_timeout`）
- 允许被打断、能识别"嗯""对"这类附和不算打断（`interruption={"mode": "adaptive"}`，已配置）

### 3.2 进度追踪（P0）

- 已走时长 / 已走距离 / 累计爬升
- 剩余距离 / 预计到达时间
- "我现在在哪" —— 反向地理编码成人话
- 面包屑轨迹持久化（事后可复盘，也是救援依据）

### 3.3 紧急处理（P0）

- 模型判断是否进入紧急模式（**不用关键词匹配**）
- 播报救援级信息：十进制坐标 + 度分秒 + 海拔 + GPS 精度
- 通知紧急联系人：短信带坐标和 Google Maps 链接
- 拨号闸门：播报 → 用户下一轮真实确认 → 才执行 → 成功后才说"已通知"
- 幂等保护：模型重复调用不会发两条/打两通
- 可解除，交接回正常模式

### 3.4 明确不做（Scope 边界）

| 不做 | 原因 |
|---|---|
| 真·拨打 911 | 运营商限制 + 法律风险 + 无法测试。改为通知预设联系人 |
| 手机端 App / 前端 | 2 小时内做不完，用 mock GPS 替代 |
| 离线模式 | 真实山区没信号是硬伤，但这是 v2 的课题 |
| 路线规划 / 导航 | 不和 AllTrails 竞争 |
| 多人组队 | 单人场景先跑通 |

---

## 4. 技术栈（已定）

### 4.1 选型与价格

| 层 | 选型 | 计费方 | 单价 | 免费额度 |
|---|---|---|---|---|
| 编排 / 托管 | LiveKit Cloud (Build) | LiveKit | $0.01/min | 1,000 min |
| WebRTC | 内置 | LiveKit | ~$0.001/min | 5,000 min |
| **STT** | `deepgram.STT(nova-3)` | Deepgram 直连 | $0.0048/min | 🎁 **$200**（≈43,000 min）|
| **TTS** | `elevenlabs.TTS(eleven_turbo_v2_5)` | ElevenLabs 直连 | $0.04/1K 字符 | 10,000 字符/月 |
| **LLM** | `inference.LLM(google/gemma-4-31b-it)` | LiveKit Inference | 入 $0.40 / 出 $1.20 per 1M tok | $2.50 credits |
| 降噪 | `ai_coustics QUAIL_VF_S` | LiveKit | $0.0012/min | 100 min |
| 地图 | Google Routes / Geocoding / Elevation | Google | $5/1000 次 | 10K / 10K / 5K 每月 |
| 短信 | Twilio SMS | Twilio | $0.0083/段 + 运营商费 | $15 试用额度 |
| 数据库 | SQLite + `aiosqlite` | — | 免费 | — |

**合计约 $0.042/min ≈ $2.5/小时。** 一次 4 小时登山约 $10。

**关键决策记录：**

- ❌ 放弃 Cartesia Sonic-3（$0.030/min）→ ✅ 换 ElevenLabs Turbo（$0.024/min），更便宜且延迟更低
- ❌ 不用 ElevenLabs Scribe 做 STT（$0.0065/min）→ ✅ 保留 Deepgram，因为 $200 免费额度用不完
- ❌ 不用 ElevenLabs Flows/Chat —— 那是 LiveKit 的竞品，编排层只能有一个
- ⚠️ ElevenLabs 已于 2026-08-31 从 LiveKit Inference 下架，必须走插件 + 自己的 `ELEVEN_API_KEY`
- 💡 TTS 占成本 57%，所以"回复简短"这条 prompt 规则直接等于省钱
- 💡 申请 **ElevenLabs Startup Grant**（12 个月免费 + 3,300 万字符 ≈ 55,000 分钟）

### 4.2 环境变量

```
LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
DEEPGRAM_API_KEY
ELEVEN_API_KEY                 # 替换原 CARTESIA_API_KEY
GOOGLE_MAPS_API_KEY            # 新增
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER   # 新增
```

📍 **上海开发注意**：Google Maps、Deepgram、ElevenLabs、Twilio 全在墙外，本地跑要给 Python 进程设代理环境变量，否则会卡在超时上白查半天。

---

## 5. 架构

### 5.1 两个 Agent，不是一个

```
TrailBuddyAgent（默认）                EmergencyAgent（handoff 进入）
├─ get_progress                        ├─ get_rescue_info
├─ describe_location                   ├─ notify_emergency_contact
├─ log_note                            ├─ place_emergency_call  ← 有闸门
├─ start_hike / end_hike               └─ stand_down ──────┐
└─ escalate_emergency ──────────────>                      │
   ▲                                                       │
   └───────────────────────────────────────────────────────┘
```

**为什么拆**：闲聊 agent 不该有拨号能力，紧急 agent 不该还在聊天气。各自只带自己的 instructions 和工具，prompt 更短、响应更快、更不容易选错工具。handoff 就是在工具里 `return EmergencyAgent()`。

### 5.2 数据流

```
GPS 来源（见下）─┐
                 ├─> HikeState (session userdata, 内存)
Google Maps ─────┘            │
   ▲                          ├─> function tools 读
   │                          │
后台任务每 30s 刷新 ───────────┘
   │
   └─> SQLite（面包屑、笔记、紧急事件审计）
```

⚠️ **GPS 不来自 Google Maps** —— Maps 是"给我坐标，我算距离"。位置只能来自设备 GPS。所以抽一个 `LocationProvider` 接口：

- `MockGpxProvider` —— 回放 GPX 轨迹文件（**v1 用这个**，也是台上唯一能演"已走 2 小时"的办法）
- `ClientProvider` —— 客户端上报（v2，需要写前端）

### 5.3 性能红线

| 规则 | 原因 |
|---|---|
| `get_progress` 只读缓存，不现场调 Maps | 用户会把 300-800ms 的 API 延迟听成卡顿 |
| 数据库必须用 `aiosqlite` 或 `asyncio.to_thread` | 同步 `sqlite3` 阻塞 event loop → **音频卡顿、agent 结巴** |
| 面包屑由后台任务写，工具只读 | 写操作不该出现在对话关键路径上 |
| Maps 结果按 ~50m 网格取整做缓存 key | 一次登山 480 次调用压到几十次，省 90% 地图费 |

---

## 6. Function Tools 设计

| Tool | 签名 | 返回 | 所属 |
|---|---|---|---|
| `start_hike` | `(destination: str)` | hike_id、路线摘要 | TrailBuddy |
| `get_progress` | `()` | `{elapsed_min, covered_km, remaining_km, eta_min, ascent_m}` | TrailBuddy |
| `describe_location` | `()` | `{place, nearest_landmark, elevation_m}` | TrailBuddy |
| `log_note` | `(note: str, kind: str)` | `{note_id}` | TrailBuddy |
| `end_hike` | `()` | 总结数据 | TrailBuddy |
| `escalate_emergency` | `(reason: str)` | → `EmergencyAgent` | TrailBuddy |
| `get_rescue_info` | `()` | 坐标/海拔/精度/最近车辆可达点 | Emergency |
| `notify_emergency_contact` | `(message: str)` | `{sid, outcome}` | Emergency |
| `place_emergency_call` | `(contact_id: int)` | `{outcome}` ← 幂等 | Emergency |
| `stand_down` | `(reason: str)` | → `TrailBuddyAgent` | Emergency |

**三条铁律：**

1. **工具返回数据，不返回句子。** 返回 `{"elapsed_min": 167}`，让模型自己说成"你走了快三个小时了"。不在 Python 里拼中文。
2. **位置类工具不收坐标参数。** 坐标来自 state，不是模型编的。
3. **工具描述决定行为。** 选错工具先改描述，不要怪模型。

---

## 7. 数据层

### 7.1 Session State（内存，每会话一个）

```python
@dataclass
class HikeState:
    hike_id: str | None = None
    user_id: str = ""
    started_at: datetime | None = None
    last_fix: GpsFix | None = None            # 最新 GPS 点
    route_cache: RouteSnapshot | None = None  # 后台刷新的 Maps 结果
    cache_updated_at: datetime | None = None
    emergency_active: bool = False
    pending_call: PendingCall | None = None   # 拨号闸门凭证
```

### 7.2 SQLite 表

| 表 | 存什么 | 关键字段 |
|---|---|---|
| `users` | 用户 | id, display_name |
| `contacts` | 紧急联系人 | phone_e164, priority, **verified**（Twilio 试用期只能发已验证号码）|
| `hikes` | 一次登山 | status, started_at, total_distance_m, livekit_room |
| `track_points` | 面包屑轨迹 | lat, lon, elevation_m, **accuracy_m** |
| `notes` | 语音笔记 | text, kind, 发生位置 |
| `emergency_events` | **紧急事件审计日志** | **id 当幂等 key**、**confirm_msg_id**、outcome、provider_sid |
| `route_cache` | Maps 结果缓存 | cache_key（坐标网格 hash）|

**值得在答辩时讲的设计点：**

- `emergency_events.id` 兼作**幂等 key** —— 模型重复调用拨号时，第二次返回第一次的结果，不会打两通电话
- `confirm_msg_id` 把"用户确认"绑定到**具体某条用户消息**，而不是信模型传来的 `confirmed=True` 布尔值
- `accuracy_m` 存 GPS 精度 —— 林区能飘 50-100m，agent 应该说"大概在…附近"而不是报假精确坐标

### 7.3 不需要其他数据库

| 候选 | 什么时候才需要 | 现在 |
|---|---|---|
| 时序数据库 | GPS 点到百万级 | ❌ 4h × 每15s = **960 行** |
| Redis | 多 worker 共享状态 | ❌ userdata 已是 per-session |
| 向量数据库 | 语义检索历史对话 | ❌ SQLite 自带 FTS5 够用 |
| Postgres / Supabase | 要做网页端实时看轨迹 | ⚠️ **唯一值得考虑的 v2 升级** |

---

## 8. 里程碑（2 小时 MVP）

| # | 任务 | 预估 |
|---|---|---|
| 1 | 换 TTS 到 ElevenLabs + 装插件 | 10 min |
| 2 | 拆 `TrailBuddyAgent` / `EmergencyAgent` + handoff | 15 min |
| 3 | `HikeState` + userdata 接线 | 10 min |
| 4 | SQLite 建表 + aiosqlite CRUD | 20 min |
| 5 | `MockGpxProvider` 位置源 | 20 min |
| 6 | 10 个 function tool（Maps 先返回假数据）| 30 min |
| 7 | `lk agent debugger` 跑通完整故事 | 15 min |
| | **合计** | **~120 min** |

**v1 之后：** 真实 Google Maps 接线（+30min）→ Twilio 短信（+30min）→ 手机前端（+2-3h）→ Supabase 实时看板（+1h）

---

## 9. 已知风险

| 风险 | 影响 | 应对 |
|---|---|---|
| **911 拨号做不到** | 核心卖点打折 | 改为通知紧急联系人，答辩时说明需要 provider 的 Emergency Calling 注册 |
| LiveKit Phone Numbers 只支持 inbound | 不能从 LiveKit 直接外呼 | 外呼必须接第三方 SIP（Twilio/Telnyx）|
| **Twilio A2P 10DLC 审核要几天** | 黑客松发不了商业短信 | 用试用额度发给已验证号码 |
| 真实山区没信号 | 整个产品前提存疑 | v1 不解决，答辩时坦诚说明；v2 方向是卫星短信（Garmin inReach / iPhone 卫星）|
| GPS 在林区精度差 | 救援坐标不准 | 存 `accuracy_m`，让 agent 表达不确定性 |
| 模型误判紧急情况 | 骚扰联系人 | 拨号闸门 + 可解除 + 审计日志 |
| 上海访问海外 API | 开发卡在超时 | 配代理环境变量 |

---

## 10. 验证计划

1. **开发中**：`lk agent debugger` 驱动真实对话，看每个回复背后的工具调用
2. **交付前**：pytest 写 turn-level 测试，至少覆盖
   - 正常路径："我走了多久" → 调用 `get_progress` 且参数正确
   - 紧急路径："我摔下去了" → 交接到 `EmergencyAgent`
   - **拒绝路径**：未经确认不得拨号（只测通过的测试证明不了闸门有用）
3. **上线前**：`scenarios.yaml` 写场景跑 `lk agent simulate`

---

## 11. 下一步

- [ ] 挑一个 ElevenLabs 音色 ID
- [ ] 申请 ElevenLabs Startup Grant
- [ ] 开 Google Maps API key（启用 Routes / Geocoding / Elevation）
- [ ] 准备一个 GPX 轨迹文件用于 mock
- [ ] 开始按里程碑实现
