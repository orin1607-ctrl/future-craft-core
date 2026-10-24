// Turning SpeechRecognition results into one clean sentence.
//
// Android Chrome (continuous mode) often repeats earlier text inside later results: a session may report
// ["שלום", "שלום מה שלומך"] or re-send the last final phrase. Joining every result naively produced the
// "my words appear twice" bug. Here a result that already contains the text so far REPLACES it, a result
// already contained in the text is ignored, and adjacent repeated phrases are collapsed.

export type RecognitionResultLike = { isFinal: boolean; 0?: { transcript?: string } };

const norm = (t: string) => String(t || '').replace(/\s+/g, ' ').trim();

function mergePiece(acc: string, piece: string): string {
  if (!acc) return piece;
  if (piece.startsWith(acc)) return piece; // cumulative result (Android)
  if (acc.endsWith(piece) || acc.includes(piece)) return acc; // re-delivered phrase
  return `${acc} ${piece}`;
}

/** Removes immediately repeated word sequences of 2+ words ("מה שלומך מה שלומך" → "מה שלומך"). */
export function collapseRepeats(text: string): string {
  const words = norm(text).split(' ').filter(Boolean);
  let changed = true;
  while (changed) {
    changed = false;
    for (let len = Math.floor(words.length / 2); len >= 2 && !changed; len -= 1) {
      for (let i = 0; i + 2 * len <= words.length; i += 1) {
        if (words.slice(i, i + len).join(' ') === words.slice(i + len, i + 2 * len).join(' ')) {
          words.splice(i + len, len);
          changed = true;
          break;
        }
      }
    }
  }
  return words.join(' ');
}

export function mergeRecognitionResults(results: ArrayLike<RecognitionResultLike>): { final: string; interim: string; full: string } {
  let final = '';
  let interim = '';
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i];
    const piece = norm(item?.[0]?.transcript || '');
    if (!piece) continue;
    if (item.isFinal) final = mergePiece(final, piece);
    else interim = mergePiece(interim, piece);
  }
  let full: string;
  if (final && interim) {
    if (interim.startsWith(final)) full = interim; // the interim already carries the final text
    else if (final.includes(interim)) full = final;
    else full = `${final} ${interim}`;
  } else {
    full = final || interim;
  }
  return { final: collapseRepeats(final), interim: collapseRepeats(interim), full: collapseRepeats(full) };
}
