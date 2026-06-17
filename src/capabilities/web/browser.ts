// Barrel module — the browser capability is decomposed into:
//   - ./browser/lifecycle.ts   — shared browser/page singleton + engine state
//   - ./browser/tools-navigation.ts  — open/navigate/scroll/reload/engine/etc.
//   - ./browser/tools-interaction.ts — click/type/key/hover/select/drag/screenshot
//   - ./browser/tools-extraction.ts  — extract/evaluate/cookies/storage/pdf
//
// Everything previously exported from this file is re-exported here so existing
// imports (`./browser.js`) keep working unchanged.
export * from './browser/lifecycle.js';
export * from './browser/tools-navigation.js';
export * from './browser/tools-interaction.js';
export * from './browser/tools-extraction.js';
