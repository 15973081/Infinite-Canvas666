# AI 对话的 Office 附件分析

上传 DOCX、XLSX 后，在 AI 对话中提出分析需求。后端提取文件内容，作为用户附件文字提供给已选模型；不调用外部文档转换服务。

- DOCX 使用 MarkItDown 0.1.8 转成 Markdown，保留正文及可转换的标题、列表、表格结构，不保留原始页面排版。
- XLSX 使用 openpyxl 专门提取分镜表：按工作表输出，保留原始行号、空单元格、文本镜号及 `000` 等纯零数字格式。合并区域重复填入左上角内容，并在输出中说明该规则。
- 公式优先读取文件保存的缓存值；没有缓存值时保留公式并标注“公式未计算”。后端不执行或重新计算公式。
- 内嵌图片不进行视觉识别；输出会提示图片未分析，需要单独上传图片。仅含图片的 XLSX 会提示未找到可读单元格。
- 每个附件最多提供 100000 字符，超过时附带明确截断提示。对话最多上传 4 个附件。此限制独立于 Skill 引用的 1000000 字符上限。
- 损坏、加密或过大的 Office 文件返回可读错误，包含附件名称。解析成功前不写入新消息，也不向模型发送请求。解析在线程中执行，避免阻塞聊天事件循环。
- 此次新增的是 DOCX/XLSX；旧版 DOC/XLS、PDF 的内容解析尚未接入。

## 部署

在实际运行服务的 Python 环境安装更新后的依赖并重启后端：

```powershell
.\python\python.exe -m pip install -r requirements.txt
```

云部署使用 `requirements-cloud.txt`，它已包含上述基础依赖。MarkItDown 0.1.8 支持 Python 3.10–3.14。

## 验证

附件默认权限、原文件存储位置、删除及备份边界见 [AI 对话数据边界](chat-data-boundaries.md)。

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_document_attachments.py tests/test_prompt_skills.py tests/test_chat_error_ui.py tests/test_chat_billing.py -q
```

覆盖中文 DOCX 表格、XLSX 多工作表、合并单元格、前导零镜号、日期、缓存及未计算公式、内嵌图片提示、长文本、截断、空文件、损坏文件及两种聊天接口的失败隔离。
