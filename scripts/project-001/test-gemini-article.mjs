import { generateArticleWithGemini } from './gemini-article-service.mjs';

async function main() {
  const kw = process.argv[2] || 'מה עושה קצין רכב';
  const len = process.argv[3] || 'long';
  console.log(`\n=== בדיקת יצירת מאמר עם Gemini ===`);
  console.log(`מילת מפתח: "${kw}"`);
  console.log(`אורך מבוקש: "${len}"\n`);

  const result = await generateArticleWithGemini({
    keyword: kw,
    length: len
  });

  console.log('Result status:', result.ok ? 'SUCCESS' : 'FAILED');
  if (result.ok) {
    console.log('Model:', result.model);
    console.log('Title:', result.title);
    console.log('Meta Description:', result.meta_description);
    console.log('Word Count:', result.word_count);
    console.log('\nPreview first 300 chars of HTML:');
    console.log(result.content_html.slice(0, 300));
  } else {
    console.error('Error Code:', result.errorCode || result.status);
    console.error('Error Status:', result.errorStatus);
    console.error('Full Error:', result.error);
  }
}

main();
