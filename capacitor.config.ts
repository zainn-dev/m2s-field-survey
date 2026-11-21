import type { CapacitorConfig } from '@capacitor/cli';

const isDevHttp = process.env.CAPACITOR_DEV_HTTP === 'true';

const config: CapacitorConfig = {
  appId: 'org.miles2smile.fieldsurvey',
  appName: 'M2S Field Survey',
  webDir: 'apps/mobile/dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: isDevHttp,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 1500,
      backgroundColor: '#FDC513',
      showSpinner: true,
      spinnerColor: '#181611',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#FDC513',
    },
  },
};

export default config;
