import { createModernCanvasRuntime } from '../canvas/application/modern-canvas-runtime';
import { createCanvasRepository } from '../canvas/infrastructure/canvas-repository';
import { createTaskClient } from '../canvas/infrastructure/task-client';
import { mountCanvasAppV2 } from '../canvas/ui/canvas-app-v2';
import { migrateLegacySmartDocument } from '../features/smart-canvas/domain';
import { mountStudioTheme } from '../shared/theme';

mountStudioTheme();

const root = document.getElementById('smartCanvasApp');
if (!root) throw new Error('Missing #smartCanvasApp');

const runtime = createModernCanvasRuntime(createTaskClient());
await runtime.initialize();
const repository = createCanvasRepository();

mountCanvasAppV2(root, {
  configuration: {
    assetInboxKey: 'smart_canvas_asset_inbox',
    createLabel: '新建智能画布',
    defaultTitle: '智能画布',
    heading: '智能画布',
    initialCanvasId: new URLSearchParams(window.location.search).get('id') || '',
    kind: 'smart',
    managerBackHref: '/static/canvas.html',
    subtitle: 'React + TypeScript 智能工作流与多模型生成画布',
  },
  repository: {
    ...repository,
    get: async (canvasId, options) => migrateLegacySmartDocument(await repository.get(canvasId, options)),
    restoreBackup: async (canvasId, filename, options) => migrateLegacySmartDocument(await repository.restoreBackup(canvasId, filename, options)),
  },
  runtime,
});
