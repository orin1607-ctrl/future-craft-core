import fs from 'fs';

const p = 'C:/Users/אליאב/Projects/oren-car-carpart-staging/src/features/claims/claims-ai.css';
let content = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const target = `.claims-root .claims-ai-entry-modes {
  margin: 0 16px 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.claims-root .claims-ai-entry-hint {
  flex-basis: 100%;
  padding: 8px 12px;
  background: var(--bg3);
  border: 1px solid var(--br2);
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
}`;

const replacement = `.claims-root .claims-ai-entry-modes {
  margin: 0 16px 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.claims-root .claims-ai-entry-hint {
  flex-basis: 100%;
  padding: 8px 12px;
  background: var(--bg3);
  border: 1px solid var(--br2);
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .claims-root .claims-ai-entry-modes {
    margin: 0 8px 6px !important;
    gap: 6px !important;
  }
  .claims-root .claims-ai-entry-modes .btn {
    font-size: 13px !important;
    padding: 6px 10px !important;
    border-radius: 8px !important;
    flex: 1 1 calc(50% - 6px);
    text-align: center;
    justify-content: center;
    min-height: 38px !important;
  }
  .claims-root .claims-ai-entry-hint {
    font-size: 12px !important;
    padding: 6px 10px !important;
    line-height: 1.4 !important;
  }
}`;

if (!content.includes(target)) {
  console.error('Target not found in CSS');
  process.exit(1);
}

content = content.replace(target, replacement);
fs.writeFileSync(p, content, 'utf8');
console.log('Successfully updated claims-ai.css');
