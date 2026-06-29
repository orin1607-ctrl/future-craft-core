#!/usr/bin/env node
/**
 * Compile approved website-builder source into scoped module.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public/ai-marketing/website-builder-approved-source.html');
const raw = readFileSync(SRC, 'utf8');

const styleMatch = raw.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = raw.match(/<body>([\s\S]*?)<script>/);
const scriptMatch = raw.match(/<script>([\s\S]*?)<\/script>/);
if (!styleMatch || !bodyMatch || !scriptMatch) throw new Error('parse failed');

let css = styleMatch[1];
css = css
  .replace(/:root\s*\{/g, '#website-builder-root.wb-wiz{')
  .replace(/\*\{box-sizing:border-box;margin:0;padding:0;\}/g, '#website-builder-root.wb-wiz,#website-builder-root.wb-wiz *{box-sizing:border-box;}')
  .replace(/body\{[^}]+\}/g, '')
  .replace(/(^|\n)(\.[a-zA-Z#@][^{;\n]+|\#[a-zA-Z][^{;\n]+)/g, (m, pre, sel) => {
    if (sel.startsWith('@') || sel.includes('#website-builder-root')) return m;
    return pre + '#website-builder-root ' + sel.trim();
  });

css += `
#website-builder-root.wb-wiz{font-family:'Heebo',sans-serif;background:var(--bg);color:var(--w);min-height:100vh;overflow-x:hidden;margin:0;padding:0;}
#screen-business-strategy.active{display:flex;flex-direction:column;}
#screen-business-strategy .biz-strategy-root,#screen-business-strategy .website-builder-root{flex:1;overflow:auto;}
`;

const shell = bodyMatch[1].trim();
const js = scriptMatch[1].trim();

const wrapper = `/**
 * Website Builder Wizard — compiled from approved design
 */
(function () {
  'use strict';
  var strategyRoot = null;
  var builderRoot = null;
  var shellHtml = ${JSON.stringify(shell)};

${js}

  function mountBuilder() {
    strategyRoot = document.getElementById('biz-strategy-root');
    builderRoot = document.getElementById('website-builder-root');
    if (!builderRoot) return Promise.resolve(false);
    builderRoot.innerHTML = shellHtml;
    builderRoot.classList.add('wb-wiz');
    if (strategyRoot) strategyRoot.style.display = 'none';
    builderRoot.style.display = '';
    if (typeof wbInit === 'function') wbInit();
    return Promise.resolve(true);
  }

  function closeBuilder() {
    strategyRoot = document.getElementById('biz-strategy-root');
    builderRoot = document.getElementById('website-builder-root');
    if (builderRoot) {
      builderRoot.style.display = 'none';
      builderRoot.innerHTML = '';
    }
    if (strategyRoot) {
      strategyRoot.style.display = '';
      strategyRoot.classList.add('biz-wiz');
    }
  }

  function openBuilder() {
    if (typeof goScreen === 'function') goScreen('screen-business-strategy');
    return mountBuilder();
  }

  window.wbPrev = wbPrev;
  window.wbNext = wbNext;
  window.closeWebsiteBuilder = closeBuilder;
  window.WebsiteBuilderWizard = {
    VERSION: '1.0.0-approved',
    open: openBuilder,
    close: closeBuilder,
    mount: mountBuilder,
  };
})();
`;

writeFileSync(join(ROOT, 'public/ai-marketing/website-builder-wizard.css'), css.trim() + '\n');
writeFileSync(join(ROOT, 'public/ai-marketing/website-builder-module.js'), wrapper);
console.log('compiled website builder OK', { css: css.length, shell: shell.length, js: wrapper.length });
