(() => {
  'use strict';
  const node = (tag, text) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  };
  window.ChatAttachmentPreview = {
    open(ref, apply, returnFocus) {
      const dialog = node('dialog'); dialog.className = 'chat-attachment-dialog chat-document-preview';
      dialog.setAttribute('aria-label', '附件解析预览');
      const head = node('header'), close = node('button', '关闭');
      close.type = 'button'; close.onclick = () => dialog.close();
      head.append(node('h2', '附件解析预览'), close);
      const warnings = node('div'), choices = node('fieldset'), content = node('pre'), status = node('p');
      choices.append(node('legend', '引用范围')); status.setAttribute('role', 'status');
      const full = node('input'), fullLabel = node('label'); full.type = 'checkbox'; full.checked = !ref.selection;
      fullLabel.append(full, document.createTextNode('引用全文')); choices.append(fullLabel);
      const selections = node('div'); choices.append(selections);
      const refresh = node('button', '更新预览'), save = node('button', '应用引用范围');
      refresh.type = save.type = 'button'; save.hidden = !apply; save.disabled = true;
      dialog.append(head, node('p', ref.name || '附件'), warnings, choices, status, content, refresh, save);
      document.body.append(dialog); dialog.showModal();
      dialog.addEventListener('close', () => { dialog.remove(); if (returnFocus?.isConnected) returnFocus.focus(); }, { once: true });
      let metadata, inputs = [];
      function selection() {
        if (full.checked) return null;
        const value = {kind: metadata.kind, sha256: metadata.sha256};
        if (metadata.kind === 'docx') value.sections = inputs.filter(i => i.check.checked).map(i => i.id);
        else value.sheets = inputs.filter(i => i.check.checked).map(i => ({name: i.id, region: i.region.value.trim().toUpperCase()}));
        if (!(value.sections || value.sheets).length) throw Error('请至少选择一个章节或工作表。');
        return value;
      }
      function toggle() {
        for (const input of inputs) { input.check.disabled = full.checked; if (input.region) input.region.disabled = full.checked || !input.check.checked; }
      }
      function build(data) {
        metadata = data; inputs = [];
        for (const item of data.kind === 'docx' ? data.sections : data.sheets) {
          const check = node('input'), label = node('label'); check.type = 'checkbox';
          const id = data.kind === 'docx' ? item.id : item.name;
          check.checked = !ref.selection || (data.kind === 'docx' ? ref.selection.sections?.includes(id) : ref.selection.sheets?.some(s => s.name === id));
          label.append(check, document.createTextNode(data.kind === 'docx' ? item.title : item.name + ' · ' + item.rows + ' 行 × ' + item.columns + ' 列' + (item.hidden ? ' · 隐藏表' : '')));
          const row = node('div'); row.append(label); const input = {id, check};
          if (data.kind === 'xlsx') {
            const region = node('input'); region.type = 'text'; region.placeholder = '例如 A1:D20，留空引用整表';
            region.setAttribute('aria-label', item.name + ' 单元格区域'); region.maxLength = 32;
            region.value = ref.selection?.sheets?.find(s => s.name === id)?.region || '';
            row.append(region); input.region = region;
          }
          check.onchange = toggle; inputs.push(input); selections.append(row);
        }
        toggle();
      }
      async function load(commit = false) {
        refresh.disabled = save.disabled = true; choices.disabled = true; status.textContent = '解析中…';
        try {
          const chosen = metadata ? selection() : ref.selection || null;
          const response = await fetch('/api/chat/attachments/preview', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...ref, selection: chosen})});
          const data = await response.json();
          if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : '范围格式错误，请检查章节和单元格区域。');
          if (!dialog.isConnected) return;
          if (!metadata) build(data);
          warnings.replaceChildren(...data.warnings.map(value => node('p', value)));
          content.textContent = data.text;
          status.textContent = '引用文字约 ' + data.characters.toLocaleString() + ' 字符'
            + (data.preview_truncated ? '；预览仅显示前 20,000 字符。' : '。')
            + (data.truncated ? '附件超过发送文字上限，请继续缩小范围。' : '');
          save.disabled = !data.characters;
          if (commit && data.characters) { dialog.close(); apply(chosen); }
        } catch (error) { if (dialog.isConnected) status.textContent = error.message; }
        finally { choices.disabled = false; refresh.disabled = false; toggle(); }
      }
      full.onchange = toggle; refresh.onclick = () => load(); save.onclick = () => load(true); load();
    }
  };
})();
