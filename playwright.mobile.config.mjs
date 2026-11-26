import {defineConfig,devices} from '@playwright/test';
import base from './playwright.config.mjs';
export default defineConfig({
 ...base,testMatch:['mobile-layout.spec.mjs','mobile-workflows.spec.mjs'],outputDir:'work/playwright-mobile-results',
 projects:[
  // WebKit rejects Chromium-only fake-media launch flags inherited from base.use.
  {name:'iphone-webkit',use:{...base.use,...devices['iPhone 13'],browserName:'webkit',permissions:['geolocation'],launchOptions:{}}},
  {name:'android-chromium',use:{...base.use,...devices['Pixel 7'],browserName:'chromium',permissions:['geolocation']}}
 ]
});
