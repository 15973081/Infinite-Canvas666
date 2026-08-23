import apiSettingsTemplate from './api-settings.template.html?raw';

export function ProviderStudioApp() {
  return (
    <div
      className="api-settings-react-root"
      dangerouslySetInnerHTML={{ __html: apiSettingsTemplate }}
    />
  );
}
