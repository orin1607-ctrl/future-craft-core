async function main() {
  // Query bus fleet dataset
  const res = await fetch("https://data.gov.il/api/3/action/datastore_search?resource_id=91d298ed-a260-4f93-9d50-d5e3c5b82ce1&limit=50");
  const d = await res.json();
  if (d.success && d.result.records) {
    const operators = {};
    for (const r of d.result.records) {
      const op = r.operator_nm;
      operators[op] = (operators[op] || 0) + 1;
    }
    console.log("מפעילי אוטובוסים במאגר:", operators);
  }

  // Query Registrar of Companies for bus companies
  const res2 = await fetch("https://data.gov.il/api/3/action/datastore_search?resource_id=f004176c-b85f-4542-8901-7b3176f9a054&limit=20&q=היסעים");
  const d2 = await res2.json();
  if (d2.success && d2.result.records) {
    console.log("\nחברות היסעים פעילות ברשם החברות:");
    d2.result.records.filter(r => r['סטטוס חברה'] === 'פעילה').slice(0, 8).forEach(r => {
      console.log(`- ${r['שם חברה']} (ח.פ. ${r['מספר חברה']}) | כתובת: ${r['שם רחוב']} ${r['מספר בית']}, ${r['שם עיר']}`);
    });
  }
}
main();
