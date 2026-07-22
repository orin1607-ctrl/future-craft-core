import fs from 'node:fs';
import { execSync } from 'node:child_process';
const PROD='qasomfndnjuixgjmjwcm';
const PROD_URL=`https://${PROD}.supabase.co`;
const token=(process.env.SUPABASE_ACCESS_TOKEN||'').trim();
const srkEnv=(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
function keys(){
  if(srkEnv) return srkEnv;
  const raw=execSync(`npx --yes supabase projects api-keys --project-ref ${PROD} -o json`,{encoding:'utf8',env:process.env});
  const arr=JSON.parse(raw);
  return arr.find(k=>k.name==='service_role'&&k.type==='legacy')?.api_key;
}
async function req(path, bearer){
  const res=await fetch(PROD_URL+path,{headers:{apikey:bearer,Authorization:`Bearer ${bearer}`}});
  return res.json();
}
const srk=keys();
const companies=['אילנה אטיאס','יוני הקווים','מוסך יוני','דליה','אכבים'];
const out={at:new Date().toISOString(), companies:{}};
for(const c of companies){
  const tpls=await req(`/rest/v1/declaration_templates?company_name=eq.${encodeURIComponent(c)}&select=id,name,body,is_default,updated_at&order=is_default.desc`, srk);
  const drivers=await req(`/rest/v1/drivers?company_name=eq.${encodeURIComponent(c)}&select=id,full_name,phone,status&limit=20`, srk);
  const decls=await req(`/rest/v1/driver_declarations?company_name=eq.${encodeURIComponent(c)}&select=id,driver_name,status,declaration_text,template_id,created_at,sent_at,token&order=created_at.desc&limit=15`, srk);
  out.companies[c]={
    templates:(tpls||[]).map(t=>({id:t.id,name:t.name,is_default:t.is_default,updated_at:t.updated_at,body_len:(t.body||'').length,seed:(t.body||'').includes('לא נתגלו אצלי'),preview:(t.body||'').slice(0,100)})),
    drivers:(drivers||[]).map(d=>({id:d.id,name:d.full_name,phone:d.phone,status:d.status})),
    declarations:(decls||[]).map(d=>({id:d.id,driver:d.driver_name,status:d.status,created_at:d.created_at,sent_at:d.sent_at,seed:(d.declaration_text||'').includes('לא נתגלו אצלי'),preview:(d.declaration_text||'').slice(0,100),token_tail:d.token?String(d.token).slice(-8):null,template_id:d.template_id})),
  };
}
// all templates updated recently
const recent=await req(`/rest/v1/declaration_templates?select=id,company_name,name,is_default,updated_at,body&order=updated_at.desc&limit=20`, srk);
out.recent_templates=(recent||[]).map(t=>({company:t.company_name,name:t.name,is_default:t.is_default,updated_at:t.updated_at,seed:(t.body||'').includes('לא נתגלו אצלי'),preview:(t.body||'').slice(0,80)}));
// recent declarations
const recentD=await req(`/rest/v1/driver_declarations?select=id,company_name,driver_name,status,created_at,declaration_text,token&order=created_at.desc&limit=20`, srk);
out.recent_declarations=(recentD||[]).map(d=>({company:d.company_name,driver:d.driver_name,status:d.status,created_at:d.created_at,seed:(d.declaration_text||'').includes('לא נתגלו אצלי'),preview:(d.declaration_text||'').slice(0,80),token_tail:d.token?String(d.token).slice(-8):null}));
fs.writeFileSync('public/project-001/production-declaration-stale-diagnose2.json', JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
