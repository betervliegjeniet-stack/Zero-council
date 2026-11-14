import type { CapacitorConfig } from '@capacitor/cli';

// M8: wraps the web build (dist/) as an iOS / Android app.
const config: CapacitorConfig = {
  appId: 'com.zerocouncil.game',
  appName: 'Zero Council',
  webDir: 'dist',
  backgroundColor: '#0b0a09',
  ios: { contentInset: 'always' },
  android: { backgroundColor: '#0b0a09' },
  plugins: { SplashScreen: { launchShowDuration: 0, backgroundColor: '#0b0a09' } },
};

export default config;
