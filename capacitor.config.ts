import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ekadanta.temple',
  appName: 'The Temple of Eka-Danta',
  webDir: 'dist',
  // The game ships offline: everything is bundled, no server, no runtime CDN.
  server: { androidScheme: 'https' },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0B1220',
    // Hardware-accelerated WebView for WebGL2; the activity itself is immersive (see MainActivity).
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#0B1220',
    preferredContentMode: 'mobile',
    scheme: 'The Temple of Eka-Danta',
  },
  plugins: {
    StatusBar: { overlaysWebView: true, style: 'DARK' },
    SplashScreen: { launchShowDuration: 0 },
  },
};

export default config;
