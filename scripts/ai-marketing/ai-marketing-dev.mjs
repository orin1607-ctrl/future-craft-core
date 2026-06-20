/**
 * CO.CO Dalia — Dev: API server + static dashboard
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = process.env.AI_MARKETING_PORT || '8888';

const api = spawn('node', ['scripts/ai-marketing/api-server.mjs'], { cwd: root, stdio: 'inherit', shell: true });
const serve = spawn('npx', ['--yes', 'serve', 'public', '-l', PORT], { cwd: root, stdio: 'inherit', shell: true });

console.log('\n=== CO.CO Dalia Dev ===');
console.log(`Dashboard: http://localhost:${PORT}/ai-marketing-platform.html`);
console.log(`API:       http://127.0.0.1:8787\n`);

function shutdown() { api.kill(); serve.kill(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
