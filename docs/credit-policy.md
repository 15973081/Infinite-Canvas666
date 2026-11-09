# 控制台积分规则

管理平台 → 运营与费用 → 积分规则，在全平台范围配置。

本模块复用 `C:\project\skill-clone\output\pixmax-credits-20261016`
的已清洗规则。`config/credit-policy-defaults.json` 是随项目发布的独立快照，
运行时不依赖外部目录、不访问 Pixmax，也不携带账户数据、Cookie 或凭证。
模型编码沿用快照，尚未自动绑定本项目供应商的模型 ID。

## 已实现

- 默认每元 15 积分；69、399、2499、4999 元档位，分别赠送 15%、30%、50%、70%。
- 充值基础积分和赠送积分分别向下取整；自定义整数金额匹配最高已达到门槛。
- 首充、邀请、创作奖励的开关、资格门槛和额度配置。首充试算的资格由管理员显式指定，
  不作为支付或领取成功的证据。
- 78 条模型规则，保留参数组合、视频输入分支、输入素材费用、字符计费及折扣时段。
  搜索模型后可编辑价格、启用状态、折扣和计费开关。
- 后端试算使用 Decimal；字符数与 JavaScript UTF-16 长度一致；活动开始包含、结束不含；
  折后任务总价四舍五入，最低 1 积分。输入素材费用按任务添加，不乘生成数量。
- 缺少模型、参数组合、输入视频时长或有效价格时拒绝报价，不推断为免费。
- PostgreSQL 持久化、版本冲突保护和原子操作审计。修改原因、前后配置和版本进入审计。
- `credits.configure.platform` 可以查看和保存；`audit.platform` 只可查看和试算。
  企业控制台、工作台会话和无权限账号不能配置平台积分规则。

## 当前运行边界

这是配置与试算模块，状态为 `configuration_only`。保存不会触发自动充值入账、
首充或邀请奖励发放、任务扣费、过期清理或退款。现有人工赠送和人民币成本账本保持原逻辑。
当前钱包只支持永久积分，配置不允许切换到暂未实现的有效期类型。

正式扣费接入还需要：将供应商模型映射到规则、任务提交时保存报价版本与价格快照、
冻结/结算/退款事务，以及支付回调和奖励资格的幂等校验。不得直接把试算 API 当作结算 API。

## 接口

- `GET /api/credits/policy`：配置、版本和参考日期；未保存时返回内置默认值，版本 0。
- `PUT /api/credits/policy`：`config`、`expected_version`、`reason`，保存成功返回新版本。
- `POST /api/credits/policy/preview`：`kind: topup | model`，可携带未保存的 `config`。
  不携带配置时读取已保存版本；不修改钱包。

## 安装与验证

部署需包含新增配置文件及迁移 `044_credit_policy.sql`。在目标环境按现有部署流程执行：

```powershell
.\.venv\Scripts\python.exe tools/cloud_storage.py init-db --env <目标环境文件>
.\.venv\Scripts\python.exe tools/build_management.py
```

随后重启管理后端，刷新控制台。迁移为已有超级管理员添加积分配置权限；
其他角色可由超级管理员通过角色管理授予。

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_credit_policy.py -q
.\.venv\Scripts\python.exe tools/cloud_test.py -k credit_policy
$env:NODE_PATH = Join-Path (Get-Location) 'frontend/node_modules'
node --test tests/management-credit-policy.browser.cjs
```

数据库测试使用独立测试库和临时 schema，不向工作账户写入积分。
