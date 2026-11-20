import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.majlis.app',
  appName: 'Majlis',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
