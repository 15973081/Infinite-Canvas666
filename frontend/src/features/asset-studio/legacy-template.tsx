export function LegacyAssetManagerTemplate() {
  return (
    <>
      <div className="asset-page">
        <header className="asset-page-head">
          <div>
            <div className="asset-title">素材库管理</div>
            <div className="asset-sub">按库、分组、内容和预览管理素材与提示词。</div>
          </div>
          <div className="asset-head-actions">
            <div id="assetStatus" className="asset-status">准备就绪</div>
            <button id="refreshBtn" className="asset-btn" type="button">
              <i data-lucide="refresh-cw" />
              <span>刷新</span>
            </button>
          </div>
        </header>

        <div className="asset-tabs">
          <button id="assetTabAssets" className="active" type="button" data-tab="assets">
            <i data-lucide="image" />
            <span>图片资产</span>
          </button>
          <button id="assetTabWorkflows" type="button" data-tab="workflows">
            <i data-lucide="workflow" />
            <span>工作流管理</span>
          </button>
          <button id="assetTabPrompts" type="button" data-tab="prompts">
            <i data-lucide="text-cursor-input" />
            <span>提示词库</span>
          </button>
          <button id="assetTabCanvasAssets" type="button" data-tab="canvas-assets">
            <i data-lucide="layout-dashboard" />
            <span>画布资产</span>
          </button>
          <button id="assetTabLocal" type="button" data-tab="local">
            <i data-lucide="folder-open" />
            <span>本地素材</span>
          </button>
        </div>

        <main id="assetManagerRoot" className="asset-manager-root" />
      </div>

      <input
        id="assetUploadInput"
        type="file"
        accept="image/*,video/*,audio/*,.json,.zip,application/json,application/zip"
        multiple
        hidden
      />
    </>
  );
}
