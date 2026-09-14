# 独立后台供应商连接检测与模型选择验收

更新：2026-09-14。M2 第十八批，继续[供应商配置与分配](managed-providers-local.md)的迁移。

## 已实现

供应商列表新增“检测与模型”。管理员填写原因后，用该供应商已保存的地址、协议、代理和服务端凭证访问模型列表；不会发送浏览器临时密钥，也不会读取旧主机环境密钥。支持 OpenAI、Apimart、Gemini、火山协议对应的模型列表路径，检测不受空间使用分配限制，但必须持有平台 provider.configure 权限。

结果显示 HTTP 状态、耗时及可选择的模型。分类沿用名称推测规则并明确提示；管理员勾选后确认追加，已有模型和价格历史保留，不自动启用供应商、分配空间或改变协议。未选择、每类合并后超过 500 项、配置版本已变化时拒绝保存；原选择保留以便核对。

HTTP 请求只调用模型列表 GET，不调用生成接口，不跟随上游跳转，不使用环境代理。单轮总时限 20 秒，连接时限 5 秒，单次网络读写时限 10 秒；响应正文限制 1 MiB，最多展示 1500 个去重模型，遇已知分页标记或数量上限明确显示部分列表。不把空列表、不支持的列表接口或检测成功当作生成能力证明。

模型 ID 过滤超长/非字符串/空白控制字符及明文凭证反射。上游原始正文、Location、请求头和异常文本不会返回页面或写入审计，错误按凭证拒绝、限流、跳转、接口不支持、响应格式、超时等分类。

## 权限、版本与审计

POST /api/providers/{provider_id}/probe 只接受当前配置版本和操作原因。开始时在短事务内鉴权、读取快照和记录 provider.probe.started；网络等待期间不持有权限协调锁。结束时重新鉴权并检查配置版本，通过后记录 provider.probe.finished 和脱敏状态/数量/耗时。

撤权、会话失效或配置变更后，旧请求结果不返回模型内容；没有 finished 的 started 表示结果未被确认，不能当作成功检测。请求不保存供应商配置。真正追加仍走已有 PUT 接口的版本检查及审计事务。

前端关闭弹窗、退出、切换账号/视图或打开另一检测弹窗后，迟到结果不重新显示；再次检测会清除上一轮可提交结果。无新增数据库迁移。

## 本地复现与验收

使用项目内 Python 运行：

~~~powershell
.\python\python.exe tools\management_preview.py --provider-probe
~~~

工具使用 canvas_cloud_test 中随机 management_ui_* schema，创建合成管理员和模拟供应商，在随机回环端口提供模型列表。管理页为 http://localhost:8767，与用户当前 http://127.0.0.1:8770 的管理测试站点使用不同主机名，避免不同端口共用同名 Cookie。默认不加此参数的管理预览仍使用原地址。凭证和加密主密钥仅用于本轮临时数据。写入输出的 stop_file 即停止模拟服务、写出 GET 请求记录并清理本轮 schema。

新增 23 项 PostgreSQL/HTTP 用例覆盖四种协议、只读请求、脱敏、响应限制、异常/整体超时、前置权限和并发改配置/撤权；4 项前端用例覆盖明确确认、模型合并上限、失败重试和迟到响应。最终回归：

- python tools/cloud_test.py --tb=line：177 通过。
- python -m pytest -o pythonpath=. tests -q --tb=line：120 通过，177 云测试跳过，7 subtest 通过。
- node --test tests/*.cjs：230 通过。

浏览器真实走通检测、未勾选提示、追加图片/视频模型且保留原模型、未选对话模型不入库、另一页面改配置后的冲突、401 脱敏提示。数据库核实保存结果与审计；首轮模拟服务只有 3 次模型 GET，生成任务及付费提交记录均为 0。另复验 localhost 主机名下的登录及模型检测。

证据：.local/cloud/acceptance/provider-probes-final-{postgres,python,frontend}.log；截图 provider-probe-model-selection.png、provider-probe-stale-selection.png、provider-probe-auth-error.png、provider-probe-localhost.png；每轮 schema 对应目录内的 probe-requests.json。两轮测试预览均正常退出并核实 schema 不再存在；localhost 复验仅增加 1 次本地模型 GET。

## 后续范围

本批完成基于已保存配置的模型列表检测和明确选择导入。后续第十九批已接入[只读协议与任务端点诊断](provider-diagnostics-local.md)。ComfyUI 连接配置、旧供应商与私有凭证的显式迁移、任务处置、备份管理和工作台旧管理页面移除继续按 M2 执行。真实供应商网络与模型生成未调用；维护完整排空、双画布剩余联调和 M4 迁移恢复门槛仍保留。

开发 schema 未应用 004–012，.local/cloud/objects 保持原状。用户要求恢复的 8768/8770 服务保持运行，本批通过另外的临时管理进程验收，未重启该用户预览进程。
