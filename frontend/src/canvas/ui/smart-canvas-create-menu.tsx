import type { PointerEvent as ReactPointerEvent } from 'react';

export type SmartCanvasCreateType = 'image' | 'loop' | 'prompt';

interface SmartCanvasCreateMenuProps {
  left: number;
  onCreate(type: SmartCanvasCreateType): void;
  top: number;
}

const cards: Array<{ icon: string; subtitle: string; title: string; type: SmartCanvasCreateType }> = [
  { icon: 'upload-cloud', subtitle: '支持图片/音频/视频/批量上传', title: '上传节点', type: 'image' },
  { icon: 'text-cursor-input', subtitle: '手写或用 LLM 生成文本', title: '提示词', type: 'prompt' },
  { icon: 'repeat-2', subtitle: '控制一键运行轮数和批次', title: '循环节点', type: 'loop' },
];

export function SmartCanvasCreateMenu({ left, onCreate, top }: SmartCanvasCreateMenuProps) {
  const stopPointer = (event: ReactPointerEvent<HTMLDivElement>) => event.stopPropagation();
  return <div className="create-menu open" id="createMenu" onPointerDown={stopPointer} style={{ left, top }}>
    <div className="create-menu-grid">
      {cards.map((card) => <button className="create-card" data-create-type={card.type} key={card.type} onClick={(event) => {
        event.stopPropagation();
        onCreate(card.type);
      }} type="button">
        <span className="create-card-icon"><i data-lucide={card.icon} /></span>
        <span>
          <div className="create-card-title">{card.title}</div>
          <div className="create-card-sub">{card.subtitle}</div>
        </span>
      </button>)}
    </div>
  </div>;
}
