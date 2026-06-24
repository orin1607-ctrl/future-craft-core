const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const html = await (await fetch(`${BASE}/ai-marketing-platform.html?v=v3-unified-3b`)).text();
const ui = html.match(/name="ui-version"\s+content="([^"]+)"/)?.[1];
const commit = html.match(/name="build-commit"\s+content="([^"]+)"/)?.[1];
console.log(JSON.stringify({ ui, commit }, null, 2));
