import { useEffect } from 'react';
import comfySettingsTemplate from './comfyui-settings.template.html?raw';
import { mountComfySettingsController } from './legacy-controller';

export function ComfySettingsApp() {
  useEffect(() => {
    mountComfySettingsController();
  }, []);

  return (
    <div
      className="comfy-settings-react-root"
      dangerouslySetInnerHTML={{ __html: comfySettingsTemplate }}
    />
  );
}
