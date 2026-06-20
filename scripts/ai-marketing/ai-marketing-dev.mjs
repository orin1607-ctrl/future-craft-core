/**
 * CO.CO Dalia — Dev server: static files + OpenAI proxy
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = process.env.AI_MARKETING_PORT || '8888';

const proxy = spawn('node', ['scripts/ai-marketing/openai-proxy.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

const serve = spawn('npx', ['--yes', 'serve', 'public', '-l', PORT], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

console.log('\n=== CO.CO Dalia Dev ===');
console.log('Dashboard: http://localhost:' + PORT + '/ai-marketing-platform.html');
console.log('OpenAI proxy: http://127.0.0.1:8787\n');

function shutdown() {
  proxy.kill();
  serve.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
