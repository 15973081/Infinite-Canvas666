# 控制台积分规则

管理平台 → 运营与费用 → 积分规则，在全平台范围配置。

本模块复用 `C:\project\skill-clone\output\pixmax-credits-20261016`
的已清洗规则。`config/credit-policy-defaults.json` 是随项目发布的独立快照，
运行时不依赖外部目录、不访问 Pixmax，也不携带账户数据、Cookie 或凭证。
模型编码沿用快照；图片模型通过 `config/credit-image-models.json`，视频与理解工具通过
`config/credit-media-models.json` 显式绑定供应商和模型 ID。

## 已实现

- 默认每元 15 积分；69、399、2499、4999 元档位，分别赠送 15%、30%、50%、70%。
- 充值基础积分和赠送积分分别向下取整；自定义整数金额匹配最高已达到门槛。
- 首充、邀请、创作奖励的开关、资格门槛和额度配置。首充试算的资格由管理员显式指定，
  不作为支付或领取成功的证据。
- 84 条模型规则，保留参数组合、视频输入分支、输入素材费用、字符计费及折扣时段。
  搜索模型后可编辑价格、启用状态、折扣和计费开关。
- 后端试算使用 Decimal；字符数与 JavaScript UTF-16 长度一致；活动开始包含、结束不含。
  主价、数量和素材费用先合计，再应用折扣，最终统一按 ROUND_HALF_UP 四舍五入，正数报价最低 1 积分。
  无折扣也执行相同规则。返回的 `original`、`credits`、`extraCredits` 均为整数；
  原价和附加费展示值分别取整，不参与最终报价的再次计算；零附加费保持 0。
  输入素材费用按任务添加，不乘生成数量。
- 缺少模型、参数组合、输入视频时长或有效价格时拒绝报价，不推断为免费。
- PostgreSQL 持久化、版本冲突保护和原子操作审计。修改原因、前后配置和版本进入审计。
- `credits.configure.platform` 可以查看和保存；`audit.platform` 只可查看和试算。
  企业控制台、工作台会话和无权限账号不能配置平台积分规则。
- 普通登录成员可读取充值展示配置。账户充值面板在进入或点击“刷新充值方案”时读取生效配置，
  按门槛排序展示，基础积分和赠送积分分别向下取整；首充奖励显示规则但不计入预计到账。

## 当前运行边界

当前状态为 `active`。已绑定的成员图片、视频及 MediaKit 理解持久任务启用
预冻结、按实际交付结算和失败释放。图片按交付数量，视频按实际输出整数秒数，理解按档位计费。
保存规则只影响后续新任务，已提交任务使用冻结的报价。充值支付、首充或邀请奖励发放及过期清理尚未接入。
当前钱包只支持永久积分，配置不允许切换到暂未实现的有效期类型。

普通 `/api/chat` 与 `/api/chat/stream` 对已绑定模型启用按次积分消费。音频和 3D 保持原有人民币核算，不启用积分扣款。
历史任务没有 hold 时不补扣；未绑定的供应商或模型保持未接入状态。试算 API 不修改钱包。

## 图片模型与报价

映射按完整的 `(provider_id, model_id)` 精确匹配，不推断别名。当前绑定供应商为 `api-dfe9075f`：

| 模型 ID | modelCode | medium 品质单张积分（1K / 2K / 4K） | 每张有效输入参考图附加积分 |
|---|---|---|---:|
| gpt-image-2.5 | GPT_IMAGE_2_5_FLARE | 8 / 10 / 12 | 0 |
| gpt-image-2.5-sunburst | GPT_IMAGE_2_5_SUNBURST | 8 / 10 / 12 | 0 |
| gpt-image-2 | GPT_IMAGE_2 | 9 / 13 / 20 | 3 |
| gpt-image-2-vip | GPT_IMAGE_2 | 9 / 13 / 20 | 3 |
| nano-banana-pro | BANANA_PRO | 14 / 14 / 26 | 0 |
| nano-banana-2.1 | BANANA_2 | 8 / 12 / 18 | 0 |

这些是默认配置的产品收费绑定；VIP 与 2、Banana 2.1 与 Banana 2 共享价目，不表示供应商模型版本相同。
Banana 两条规则不区分 quality。GPT Image 2 的 low 为 2 / 3 / 4，high 为 31 / 48 / 70；
GPT Image 2.5 两条规则的 low 为 4 / 6 / 8，high 为 12 / 24 / 40，xhigh 为 24 / 46 / 70，max 为 50 / 100 / 150。
实际新任务使用管理平台已保存的规则和活动配置；未保存时读取默认配置。

`size` 使用现有人民币规格归类：最长边至少 3000 或面积大于 4,500,000 为 4K；
否则最长边至少 1800 或面积大于 1,800,000 为 2K；其余有效尺寸为 1K。
`1024x1024`、`1536x1024`、空值和 auto 为 1K；也支持显式 1K / 2K / 4K。
规则要求 quality 时，空值或 auto 报价按 medium；未知质量或规格不推断价格。
数量与生成执行一致，限制为 1–8；参考图使用生成链路的有效图片筛选，不计空 URL、视频或文档选区。

任务创建与 `freeze_credits` 处于同一数据库事务。余额不足返回 HTTP 402，明细为
`insufficient_credits`、`available_balance`、`required_credits`，不保留任务或冻结记录。
hold 的 `quote_snapshot` 保存归一化 `input`、完整单条 `rule`、`quoted_at`、`quote` 及供应商模型信息，
`quote_version` 保存配置版本。部分成功只替换 input.count，按原规则和原活动时点计算，参考图附加费仍按任务添加一次。

| 任务结果 | 积分处理 |
|---|---|
| succeeded，交付张数等于请求数 | 实扣冻结总额 |
| succeeded，交付张数大于 0 且少于请求数 | 按冻结快照重算实扣，释放差额 |
| failed 或无可交付图片 | 全额释放；空输出成功回报归为失败 |
| cancelled | 全额释放 |
| queued / running / submitting / polling / finalizing / needs_review | 保持冻结 |

结果转存和画布交付失败会回滚终态结算；恢复成功后用原结果结算，不再发起生成。
转存重试耗尽保留 needs_review 和冻结，管理员可重试交付或确认失败退回积分。
积分已经结算或退回的任务不再开放恢复入口，需要新建任务，避免退回后重新扣款。
人民币账本保留独立的供应商成本口径，用户积分释放不会改写人民币金额。

## 视频与理解模型

`volcengine` 和 `mediakit` 按完整供应商 ID、模型 ID 匹配，不推断版本或名称：

| 供应商 | 模型 ID | modelCode |
|---|---|---|
| volcengine | doubao-seedance-2-5-260628 | PIXDANCE_2_5；draft=true 为 PIXDANCE_2_5_DRAFT |
| volcengine | doubao-seedance-2-0-260128 | PIXDANCE_2 |
| volcengine | doubao-seedance-2-0-fast-260128 | PIXDANCE_2_FAST |
| volcengine | doubao-seedance-2-0-mini-260615 | PIXDANCE_2_MINI |
| volcengine | doubao-seedance-1-5-pro-251215 | SEEDANCE_1_5 |
| volcengine | doubao-seedance-1-0-pro-250528 | SEEDANCE_1_0_PRO |
| volcengine | doubao-seedance-1-0-lite-t2v-250428 | SEEDANCE_1_0_LITE |
| volcengine | doubao-seedance-1-0-lite-i2v-250428 | SEEDANCE_1_0_LITE |
| mediakit | enhance-video | MEDIAKIT_VIDEO_UPSCALE |
| mediakit | erase-video-subtitle | MEDIAKIT_SMART_ERASE |
| mediakit | erase-video-subtitle-pro | MEDIAKIT_SMART_ERASE_PRO |
| mediakit | video-understand-router | MEDIAKIT_VIDEO_UNDERSTAND |

新增默认单价如下，所有秒数向上取整且最低 1 秒：

| 规则 | 参数 | 积分 |
|---|---|---|
| SEEDANCE_1_0_PRO | 480P / 720P / 1080P | 4 / 10 / 22，每秒 |
| SEEDANCE_1_0_LITE | 480P / 720P / 1080P | 2 / 5 / 11，每秒 |
| MEDIAKIT_VIDEO_UPSCALE | standard，720P / 1080P / 2K / 4K / 8K | 1 / 1 / 2 / 3 / 5，每秒 |
| MEDIAKIT_VIDEO_UPSCALE | professional，720P / 1080P / 2K / 4K / 8K | 2 / 2 / 3 / 5 / 8，每秒 |
| MEDIAKIT_SMART_ERASE | 普通擦除 | 2，每秒 |
| MEDIAKIT_SMART_ERASE_PRO | Pro 擦除 | 4，每秒 |
| MEDIAKIT_VIDEO_UNDERSTAND | Economy / Balanced / Quality | 2 / 4 / 8，每次 |

MediaKit 超分空分辨率按 720P，空 tool_version 按 standard；理解空 level 按 Balanced。
Seedance 1.5 的 generate_audio 对应 includeAudio。其他规则继续使用原配置的分辨率、
输入视频分支和活动折扣。管理员已有配置只补齐缺失的上述六条新规则，保留原有价格、
启用状态及版本；停用规则应设置 enabled=false。

视频素材通过直接上传、分片上传或结果入库时探测文件时长，写入 `metadata.duration_seconds`。
报价优先读该元数据；历史素材在文件系统存储中可读时按需探测并回写。
Seedance 2.5 常规输入视频附加费及 MediaKit 视频工具必须取得输入秒数；
外部 URL 或不可读且缺时长的历史素材返回 `credit_input_video_duration_required`，要求先上传。

固定时长任务按请求秒数冻结。Seedance 2.5 的 -1、编辑或延长模式按 30 秒冻结，
自动分辨率按 720P；样片仍遵循现有接口的 480P 要求。升级使用常规 1080P 规则，
沿用原样片请求和冻结快照中的输入视频元数据。MediaKit 视频工具按输入秒数冻结，理解按一次冻结。
快照保存完整规则、配置版本、报价时点、参数、输入素材秒数及自动时长上限依据。

成功视频按上游有效输出时长结算；上游未提供时，转存阶段探测已落盘文件，补齐
`result.video_info.duration` 和 `result.duration_seconds`。重算只替换实际秒数及上游返回的规格，
保留原输入附加费、规则和活动时点。例如 Seedance 2.5 无输入视频、720P：
30 秒冻结 1,260 积分，实际 8 秒实扣 336，释放 924。

| 结果 | 任务及积分处理 |
|---|---|
| 视频有有效时长、报价不超过冻结额 | succeeded，实扣并释放差额 |
| 理解有有效文本 | succeeded，实扣一次档位报价 |
| 输出时长缺失、实际报价超额或实际规格无价格 | needs_review，保留结果与 FROZEN |
| failed / cancelled | 全额释放，不产生 SPEND |
| queued / submitting / polling / finalizing / needs_review | 保持冻结 |

转存恢复使用已有结果，不重复生成。恢复取得有效时长后自动结算；管理员确认失败则全额释放。
已结算或释放的任务禁止再次恢复。人民币成本与积分通过同一 task_id 独立记录；
已落盘但待核对的视频仍保留供应商成本。账户任务列表展示冻结、实扣与差额释放。
MediaKit 理解只接受持久工具任务入口；`/api/chat` 和 `/api/chat/stream` 返回 400，
普通对话使用独立的按次积分映射和交付结算。

## 普通对话

`config/credit-chat-models.json` 的 `providers` 按供应商 ID、模型 ID 精确绑定，优先于
`models` 中的通用标准模型名。通用名称也严格相等匹配，不自动匹配日期后缀、别名或预览版本。
配置覆盖 13 条普通 GENERATE_TEXT 规则；MediaKit 理解不在普通对话映射内。
未绑定模型仍保留人民币核算，不产生积分 hold。

每次调用按 `basePrice * 1 + 素材附加费` 报价。素材数量来自实际提交上游的消息，
包含本次上下文中的有效素材，不将未提交的附件算入报价。报价快照保存规则、素材数量、
活动时点和配置版本。`ai_chat_calls`、人民币账本初始记录、`chat_call` 冻结和用户消息保存
在同一事务中提交；余额不足返回 HTTP 402，不留下 pending 调用、用户消息或冻结记录。

非流式需要完整非空回复；流式还需要观察到 `[DONE]` 或 finish_reason 结束标记，且正常结束读取。
assistant 消息保存与积分实扣处于同一 PostgreSQL 事务，消息中的 chat_call_id 关联消费来源。
保存失败或结算失败会一起回滚 assistant 消息，再结束调用并释放冻结。空回复、上游拒绝、
超时、客户端取消及未完整结束的流均全额退回；已知 Token 用量仍进入人民币账本。

整次上游请求受 `REQUEST_TIMEOUT` 限制（默认 1,800 秒），避免流持续输出而无限占用冻结。
服务启动时恢复过期 pending 调用，工作台和 worker 每分钟再次检查，每批最多 100 条。
超过请求时限加 120 秒余量的 pending 调用收敛为 uncertain，并在同一事务中释放 FROZEN。
消息保存与成功终态原子提交，因此成功交付的调用不会进入悬挂清理。多个恢复进程及重复回调
通过调用行锁和钱包幂等机制收敛到同一终态。工作台恢复定时器不依赖内嵌 worker 开关。

账户任务列表同时返回 canvas_task 和 chat_call 的冻结、实扣、释放状态；pending 显示等待回复，
uncertain 显示回复中断。账单按同一 chat_call_id 关联积分记录。历史无价格任务仍显示缺少价格，
但可读取已保存的 Token 用量和视频返回时长；不补造单价或追扣历史积分。

## 钱包冻结与结算

`046_credit_consumption.sql` 扩展钱包和批次的冻结余额，新增 `credit_holds` 与
`credit_hold_allocations`。原 `ADD` 入账及管理员赠送凭证保留，消费通过独立的
`SPEND` 流水关联 hold。冻结和全额释放不产生交易流水。

`app.services.credit_wallet` 提供内部事务接口，调用方传入 PostgreSQL 连接：

```python
with connection() as conn:
    hold = freeze_credits(
        conn, member_id, source_type='canvas_task', source_id=task_id,
        credits=100, quote_version=version, quote_snapshot=quote,
        workspace_id=workspace_id, model_code=model_code,
    )

with connection() as conn:
    result = settle_credits(conn, hold['id'], 60, reason='部分成功')

# 零实扣可使用 settle_credits(..., 0) 或 release_credits。
```

- 写入按成员锁定钱包，再锁定 hold 和批次。可用积分等于充值余额加赠送余额减冻结余额。
- 冻结按 `gift` 优先、`created_at ASC, id ASC` 分摊；结算消耗相同顺序的前段，
  未用完的后段全额释放，等价于从最新充值批次开始逆向释放。
- 冻结 100、实扣 60 时，实扣与释放合计为 100，彻底解除本次冻结；其他 hold 的冻结保留。
  实扣大于冻结额拒绝结算。实扣 0 的终态为 `RELEASED`，正数实扣为 `SETTLED`。
- `(source_type, source_id)` 全局唯一。同一成员重复冻结返回原 hold（包含原报价及终态），
  不按新入参调整冻结额；其他成员使用同一来源会收到 `credit_hold_owner_conflict`。
- 终态仅接受相同实扣额和相同原因的幂等重入；不同金额或原因返回 `credit_settlement_conflict`。
- `CreditWalletError` 提供 `code` 和 `details`；`insufficient_credits` 的明细包含
  `available_balance` 与 `required_credits`。异常会回滚本次服务操作；外层事务也可统一回滚。
- 新冻结要求成员有效；已获准的 hold 可以在账号停用后完成结算或释放。

这些内部服务由图片、视频与理解任务持久化、普通对话交付及管理端任务核对流程调用，没有公开的冻结、扣款、释放 HTTP 接口。
任务 ID 同时关联 `ledger_owners.task_id` 和 `credit_holds.source_id`，积分消费流水通过 hold_id 关联。

## 钱包读取

- 工作台 `GET /api/account/credits` 只返回当前成员的钱包。
- 管理端 `GET /api/credits/wallets/{member_id}` 允许具备 `credits.gift.platform` 或
  `audit.platform` 权限的管理会话读取指定成员的钱包，参数与工作台一致。
- 原摘要字段 `total_balance`、`recharge_balance`、`gift_balance` 保持兼容，增加
  `frozenBalance`、`availableBalance`。全部积分金额仍以整数字符串返回。
- `SPEND` 每个 hold 最多一条，`amount` 为正数、界面显示负号，`balance_after` 是扣款后的账面总余额。
  消费记录的 `grant_id`、`remaining_amount`、`validity` 为 null；`allocations` 提供每批的冻结、实扣和释放明细。
- 同时消耗赠送和充值积分的记录标为 `mixed`；分类筛选按实际消耗的批次分类匹配，
  展示整笔消费金额，不将一笔流水拆成两笔。分页计数和余额在同一 SQL 快照中读取。
- `transaction_type=ADD|SPEND` 筛选收支类型；账户的消耗明细只读取 SPEND，充值明细只读取 ADD。
- `/api/account/tasks` 与账号费用查询返回 `credit_hold_id`、`credit_status`、`credit_model_code`、
  `credit_quote_version`、`credit_frozen`、`credit_settled`、`credit_released`。历史或未接入任务为 null，
  不将未知值解释为已扣零积分，也不返回报价中的提示词。
  任务列表的 `source_type` 区分 canvas_task 与 chat_call；费用查询通过 task_id 或 chat_call_id 关联原始调用。

## 接口

- 工作台 `GET /api/account/credit-policy`：返回 `config` 中的 `creditsPerCNY`、`tiers`、`rewards`、
  `validity`，以及顶层 `version`、`mode`。要求有效工作台成员会话，不需要管理权限，
  不返回模型价格规则；响应为 `Cache-Control: private, no-store`。
- `GET /api/credits/policy`：配置、版本和参考日期；未保存时返回内置默认值，版本 0。
- `PUT /api/credits/policy`：`config`、`expected_version`、`reason`，保存成功返回新版本。
- `POST /api/credits/policy/preview`：`kind: topup | model`，可携带未保存的 `config`。
  不携带配置时读取已保存版本；不修改钱包。

## 安装与验证

部署需包含 `credit-policy-defaults.json`、`credit-image-models.json`、`credit-media-models.json`、`credit-chat-models.json`
及截至 `046_credit_consumption.sql` 的迁移。视频时长探测依赖现有媒体探测工具在后端和 worker 中可用。
部署后已绑定模型要求足够可用积分，人工赠送仍可用于充值支付开放前的入账。在目标环境按现有部署流程执行：

```powershell
.\.venv\Scripts\python.exe tools/cloud_storage.py init-db --env <目标环境文件>
.\.venv\Scripts\python.exe tools/build_management.py
```

随后重启工作台、管理后端及 worker，刷新页面。积分规则迁移为已有超级管理员添加积分配置权限；
其他角色可由超级管理员通过角色管理授予。

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_media_credits.py tests/test_image_credits.py tests/test_credit_policy.py tests/test_credit_consumption.py -q
.\.venv\Scripts\python.exe tools/cloud_test.py -k 'media_credits or mediakit or image_credits or image_receipts or finalization or task_reviews or credit_policy or credit_wallet or credit_consumption or account_tasks or cloud_uploads or cloud_chat_billing or cloud_llm_tasks'
$env:NODE_PATH = Join-Path (Get-Location) 'frontend/node_modules'
node --test tests/management-credit-policy.browser.cjs tests/credit-wallet.browser.cjs tests/account-state.browser.cjs tests/account-panel.browser.cjs tests/management-credit-gifts.browser.cjs
```

数据库测试使用独立测试库和临时 schema，不向工作账户写入积分。
