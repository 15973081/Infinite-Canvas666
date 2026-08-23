import { useEffect } from 'react';
import { LegacyAssetManagerTemplate } from './legacy-template';

export function AssetStudioApp() {
  useEffect(() => {
    let active = true;

    void import('./legacy-controller').then(({ mountLegacyAssetManager }) => {
      if (active) mountLegacyAssetManager();
    });

    return () => {
      active = false;
    };
  }, []);

  return <LegacyAssetManagerTemplate />;
}
