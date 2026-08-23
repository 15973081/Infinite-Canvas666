import { useEffect } from 'react';
import apiSettingsTemplate from './api-settings.template.html?raw';
import { mountApiSettingsController } from './legacy-controller';

export function ProviderStudioApp() {
  useEffect(() => {
    mountApiSettingsController();
  }, []);

  return (
    <div
      className="api-settings-react-root"
      dangerouslySetInnerHTML={{ __html: apiSettingsTemplate }}
    />
  );
}
