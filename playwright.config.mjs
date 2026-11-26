import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./tests',
  testMatch:['browser.spec.mjs','performance-browser.spec.mjs','workflow-ux.spec.mjs'],
  fullyParallel:false,
  workers:1,
  timeout:60000,
  expect:{timeout:12000},
  outputDir:'work/playwright-results',
  reporter:[['list']],
  use:{
    baseURL:'http://127.0.0.1:8788',
    viewport:{width:1440,height:1080},
    timezoneId:'Asia/Ho_Chi_Minh',
    locale:'vi-VN',
	permissions:['camera','geolocation'],
	geolocation:{latitude:20,longitude:106,accuracy:5},
	// API mocks must remain page-interceptable; PWA behavior is validated separately.
	serviceWorkers:'block',
	// One-time issued fixture codes are exercised by account-control tests.
    // Capture only explicit, credential-free screenshots in the test itself.
    trace:'off',
    screenshot:'off',
    launchOptions:{
      ...(process.platform==='win32'?{channel:'msedge'}:{}),
      args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']
    }
  },
  webServer:{
    command:'node scripts/local-test-server.mjs',
    url:'http://127.0.0.1:8788',
    reuseExistingServer:!process.env.CI,
    timeout:60000
  }
});
