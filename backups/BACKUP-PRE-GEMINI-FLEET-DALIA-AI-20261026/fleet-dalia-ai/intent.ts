import { FLEET_ACTIONS, FLEET_CATEGORIES, type FleetCategoryId } from './actionCatalog';

export function safeSearchToken(raw: string): string {
  return raw.replace(/[%*,()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function extractQuery(text: string): string {
  const stripped = text
    .replace(/חפש|חיפוש|מצא|הצג|פתח|כרטיס|רכב|רכבים|נהג|נהגים|לוחית|מספר|רישיון|מבחן/g, ' ')
    .replace(/[%*,()]/g, ' ');
  return safeSearchToken(stripped);
}

export function matchCategory(text: string): FleetCategoryId | null {
  const hits = FLEET_CATEGORIES.filter((category) => text.includes(category.label));
  hits.sort((a, b) => b.label.length - a.label.length);
  return hits[0]?.id ?? null;
}

export function matchIntent(text: string): { actionId: string | null; query: string; category: FleetCategoryId | null } {
  const norm = text.trim();
  let best: { id: string; len: number } | null = null;
  for (const action of FLEET_ACTIONS) {
    for (const phrase of action.phrases) {
      if (norm.includes(phrase) && (!best || phrase.length > best.len)) {
        best = { id: action.id, len: phrase.length };
      }
    }
  }
  const action = best ? FLEET_ACTIONS.find((item) => item.id === best.id) : undefined;
  return {
    actionId: best?.id ?? null,
    query: extractQuery(norm),
    category: action?.category ?? matchCategory(norm),
  };
}
