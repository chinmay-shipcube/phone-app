// Item search used by the billing screen: every word typed must appear somewhere in the
// item name, in any order (the same rule as the sweet shop OMS). "16 iphone" finds
// "iPhone 16 Cover". Names that start with the query come first.

export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function matchItems<T extends { name: string }>(query: string, items: T[], limit = 30): T[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(' ');
  const hits: { item: T; score: number }[] = [];
  for (const item of items) {
    const name = normalize(item.name);
    if (!words.every((w) => name.includes(w))) continue;
    let score = 0;
    if (name === q) score += 100;
    if (name.startsWith(q)) score += 50;
    if (name.split(' ').some((part) => part.startsWith(words[0]))) score += 10;
    score -= name.length / 100; // shorter names first among equals
    hits.push({ item, score });
  }
  hits.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return hits.slice(0, limit).map((h) => h.item);
}

/** Same name ignoring case and extra spaces: "iphone 16  cover" == "iPhone 16 Cover". */
export function sameName(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}
