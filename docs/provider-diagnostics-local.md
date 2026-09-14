# 独立后台协议与任务端点诊断验收

更新：2026-09-14。M2 第十九批，继续[模型检测](provider-probes-local.md)与[供应商迁移](managed-providers-local.md)。

## 已实现

供应商行新增“协议与任务端点”。管理员填写原因后，服务端使用已保存配置和加密凭证，同时检查三类模型列表和两类虚拟任务查询入口。仅发出 GET，不创建生成任务；不跟随跳转、不采用环境代理，显式配置的代理仍生效。保留原地址中的反向代理路径前缀，仅移除末尾已知协议版本后缀后组合入口。

| 检查 | 路径 |
|---|---|
| OpenAI 模型列表 | /v1/models |
| Gemini 模型列表 | /v1beta/models |
| 火山模型列表 | /api/v3/models |
| APImart 虚拟任务 | /v1/tasks/{probe_id} |
| 火山虚拟任务 | /api/v3/contents/generations/tasks/{probe_id} |

虚拟 ID 每次随机生成，不使用已存在的任务。每项最多 18 秒，总请求最多 20 秒，单项正文最多 1 MiB；部分入口超时保留其他已完成结果。连接和读写超时沿用模型检测的 5/10 秒限制。

模型列表格式兼容可形成候选；空列表明确提示仍需核对模型。APImart 的任务候选依据其[官方任务状态文档](https://docs.apimart.ai/cn/api-reference/tasks/status)中的 400、数值错误码 400、invalid_request_error 和“无效的任务ID”错误结构，兼容对应英文文本。这只是协议兼容性的推断，不证明密钥授权或生成能力。普通 400/404、结构化错误、意外成功、HTML、401、限流和跳转均不能直接确认任务协议。火山任务路径沿用项目已有适配器；没有可确认的任务错误签名时保持无法判断。

页面展示各入口状态和脱敏解释，多个候选要求明确选择，再点“确认采用建议”才保存协议及基础地址。模型、价格配置、启用状态、空间分配和凭证保留。保留标识 volcengine 的供应商只能提供火山协议建议，与现有注册器强制规则一致。采用建议后账号绑定会按新配置重新核对，页面明确提示影响范围。

## 权限与并发

沿用 POST /api/providers/{id}/probe，新增 mode=protocols；默认 models 保持兼容。开始和结束分别复验平台 provider.configure 权限及配置版本，网络等待不持有权限协调锁。期间改配置返回 409，撤权返回 403；采用建议仍走带版本的供应商 PUT。

开始/完成审计附诊断模式及各项状态码，不记录凭证、原始响应、真实任务内容或模型列表。关闭弹窗、换页面、退出账号后丢弃迟到结果；重新诊断先清除旧候选，无候选结果不能提交旧建议。没有新增数据库 migration。

## 本地验收

使用项目内 Python 运行 tools/management_preview.py --provider-probe。该工具在 canvas_cloud_test 的随机 schema 和 http://localhost:8767 上运行，供应商是随机回环端口的模拟服务，凭证与主密钥均为合成临时值。

新增 19 项 PostgreSQL/HTTP 用例覆盖地址前缀、五次只读请求、精确任务错误结构、普通错误不误判、超时部分结果、撤权/配置竞争、非法模式及固定标识限制；新增 3 项前端用例覆盖明确采用、配置保留、迟到响应和失败重试。

最终回归：

- python tools/cloud_test.py --tb=short：196 通过。
- python -m pytest -o pythonpath=. tests -q --tb=line：120 通过，196 云测试跳过，7 subtest 通过。
- node --test tests/*.cjs：233 通过。
- 最后调整一处提示文案后复验 management-provider-probes.cjs：7 通过。

浏览器实际验证五项结果、两个候选、未选择的阻止提示、明确采用 APImart、原图片模型和凭证保留，以及全部 401 时没有采用入口。数据库核对两轮开始/完成审计及配置版本 3；生成任务和付费提交均为 0。并发撤权、配置变化和迟到响应由专项自动测试验证，本批没有重新执行双页面浏览器竞争。

证据位于 .local/cloud/acceptance/：provider-diagnostics-final-{postgres,python,frontend}.log、provider-diagnostics-database.json、provider-diagnostics-{candidates,adopted,auth-error}.png。临时 schema management_ui_81f7d2b19e214fb3a2a5fb9a76701c3b 对应目录内 probe-requests.json 只有 10 次 GET。预览进程正常退出，已查询 PostgreSQL 确认该 schema 不存在。

## 剩余范围

本批交付独立后台的只读协议诊断及人工采用。真实供应商网络与生成没有调用；诊断结果不能替代实际生成验收。旧管理页面移除、ComfyUI 连接与空间隔离、旧供应商和凭证显式导入、任务处置、备份管理及部署验证继续执行，M1/C2/C3/M3/M4 的剩余范围不变。

开发库未应用 004–012，原 .local/cloud/objects 保持原状。用户使用的 8768/8769/8770 服务均再次确认 HTTP 200；本批未重启它们，因此 8770 仍运行此前的预览版本，新诊断界面在本轮独立预览中验收。
