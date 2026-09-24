const test = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULT_CONFIG, normalizeConfig } = require('../electron/config-contract.cjs');

test('reader palette stays independent from the application theme', () => {
  assert.equal(normalizeConfig({ readerColorMode: 'invalid' }).readerColorMode, 'custom');
  assert.equal(normalizeConfig().readerColorMode, 'custom');
  const old = { readerColorMode: 'custom', textColor: '#123456', textBgColor: '#abcdef' };
  for (const theme of ['white', 'dark', 'system']) {
    const result = normalizeConfig({ ...old, theme });
    assert.equal(result.readerColorMode, 'custom');
    assert.equal(result.textColor, old.textColor);
    assert.equal(result.textBgColor, old.textBgColor);
  }
});

test('defaults to glass and validates reader background effects', () => {
  assert.equal(normalizeConfig().readerBackgroundEffect, 'glass');
  assert.equal(normalizeConfig().readerBlur, 14);
  assert.equal(normalizeConfig({ readerBackgroundEffect: 'solid', readerBlur: 99 }).readerBackgroundEffect, 'solid');
  assert.equal(normalizeConfig({ readerBackgroundEffect: 'invalid', readerBlur: -1 }).readerBackgroundEffect, 'glass');
  assert.equal(normalizeConfig({ readerBlur: 99 }).readerBlur, 30);
  assert.equal(normalizeConfig({ readerBlur: -1 }).readerBlur, 0);
});

test('clamps reader dimensions and typography while retaining negative monitor coordinates', () => {
  const result = normalizeConfig({ readerWidth: 9999, readerHeight: 1, readerX: -1400, readerY: NaN, lineHeight: 8, readerPadding: -3, readerRadius: 90, wordsPerPage: 42.8 });
  assert.equal(result.readerWidth, 1600);
  assert.equal(result.readerHeight, 100);
  assert.equal(result.readerX, -1400);
  assert.equal(result.readerY, null);
  assert.equal(result.lineHeight, 3);
  assert.equal(result.readerPadding, 4);
  assert.equal(result.readerRadius, 28);
  assert.equal(result.wordsPerPage, 43);
});

test('validates theme, reader colors, fonts and booleans', () => {
  const result = normalizeConfig({ theme: 'system', textColor: 'red', textBgColor: '#fAfAfA', fontFamily: 'unknown', textAlign: 'unknown', alwaysOnTop: 'false', rememberPosition: false, showProgress: false });
  assert.equal(result.theme, 'system');
  assert.equal(result.textColor, DEFAULT_CONFIG.textColor);
  assert.equal(result.textBgColor, '#fAfAfA');
  assert.equal(result.fontFamily, 'sans');
  assert.equal(result.textAlign, 'left');
  assert.equal(result.alwaysOnTop, true);
  assert.equal(result.rememberPosition, false);
  assert.equal(result.showProgress, false);
});

test('allows 100 by 100 reader bounds and clamps smaller saved dimensions', () => {
  for (const size of [100, 50]) {
    const config = normalizeConfig({ readerWidth: size, readerHeight: size });
    assert.equal(config.readerWidth, 100);
    assert.equal(config.readerHeight, 100);
  }
});

test('normalizes persisted reader settings without mutating defaults', () => {
  const normalized = normalizeConfig({ fontSize: 200, theme: 'unknown', key1: '' });

  assert.equal(normalized.fontSize, 32);
  assert.equal(normalized.theme, 'white');
  assert.equal(normalized.key1, DEFAULT_CONFIG.key1);
  assert.equal(DEFAULT_CONFIG.fontSize, 14);
});

test('lightweight defaults separate text opacity from background opacity', () => {
  const config = normalizeConfig();
  assert.equal(config.readerWidth, 560);
  assert.equal(config.readerHeight, 110);
  assert.equal(config.lineHeight, 1.6);
  assert.equal(config.showProgress, false);
  assert.equal(config.bgOpacity, 0.15);
  assert.equal(config.textOpacity, 1);
  const transparent = normalizeConfig({ bgOpacity: 0, textOpacity: 2 });
  assert.equal(transparent.bgOpacity, 0);
  assert.equal(transparent.textOpacity, 1);
});

test('keeps a persisted books folder and text-reading progress', () => {
  const normalized = normalizeConfig({
    books_folder_path: 'D:/books',
    currentBookName: 'example.txt',
    currentBookProgress: 18,
  });

  assert.equal(normalized.books_folder_path, 'D:/books');
  assert.equal(normalized.currentBookName, 'example.txt');
  assert.equal(normalized.currentBookProgress, 18);
});
