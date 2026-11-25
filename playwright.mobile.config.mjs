import {defineConfig,devices} from '@playwright/test';
import base from './playwright.config.mjs';
export default defineConfig({
 ...base,testMatch:'mobile-layout.spec.mjs',outputDir:'work/playwright-mobile-results',
 projects:[
  {name:'iphone-webkit',use:{...base.use,...devices['iPhone 13'],browserName:'webkit',permissions:['geolocation'],launchOptions:{}}},
  {name:'android-chromium',use:{...base.use,...devices['Pixel 7'],browserName:'chromium',permissions:['geolocation']}}
 ]
});
