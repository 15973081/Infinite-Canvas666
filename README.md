# Infinite-Canvas

基于 FastAPI 的画布工作台，包含图片、视频、对话、素材管理，以及独立的成员、供应商和费用管理平台。

当前本地交付环境使用 PostgreSQL 保存业务数据，文件系统模拟 TOS 保存素材，由画布服务、管理服务和 worker 配合运行。

## 运行与维护

启动、配置、备份、恢复和项目搬迁请阅读 [项目操作手册](docs/project-operations-manual.md)。手册中的交付日期、目录、数据库、端口和账号示例属于当时的本地环境；实际运行以本机配置及 `.local/cloud/runtime/active-delivery.json` 为准。

- `tools/delivery_service.py`：交付环境的画布、管理端及 worker 启动入口。
- `main.py`：画布后端应用。
- `management_main.py`：独立管理后端应用。
- `requirements.txt`、`requirements-cloud.txt`：应用与云存储相关依赖。
- `storage.env.example`：存储配置示例。

更新代码前，在管理平台进入维护，等待任务结束并保存画布，再停止相关服务。具体操作见手册。

## 项目目录

| 目录 | 用途 |
| --- | --- |
| `app/` | 后端业务、接口与存储 |
| `static/` | 工作台静态资源 |
| `management/` | 独立管理平台前端 |
| `tools/` | 启动、构建、迁移与维护工具 |
| `tests/` | 自动化测试 |
| `docs/` | 功能说明、架构、运维与变更记录 |

ComfyUI 与 ModelScope 专用集成已移除，具体边界见 [弃用集成记录](docs/retired-integrations.md)。历史画布、素材和旧配置可能仍用于展示或迁移，不能按普通缓存清理。

## 来源与许可

本项目基于 Infinite-Canvas 持续开发。原作者主页：[Bilibili](https://space.bilibili.com/78652351)。使用与分发须遵守 [LICENSE](LICENSE) 中的许可和署名要求。
