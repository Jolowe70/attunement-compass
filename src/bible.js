// The whole King James Bible (public domain), bundled with the app in /kjv (one file per book, loaded only when needed).
// Selah only ever gives references; the words shown are always looked up here, exactly as printed in the KJV.
export const BOOKS = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
  '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
  'Jude', 'Revelation'];

const ALIAS = { psalm: 'Psalms', ps: 'Psalms', psa: 'Psalms', 'song of songs': 'Song of Solomon', song: 'Song of Solomon', canticles: 'Song of Solomon',
  gen: 'Genesis', ex: 'Exodus', exod: 'Exodus', lev: 'Leviticus', num: 'Numbers', deut: 'Deuteronomy', josh: 'Joshua', judg: 'Judges', neh: 'Nehemiah',
  esth: 'Esther', prov: 'Proverbs', eccl: 'Ecclesiastes', eccles: 'Ecclesiastes', isa: 'Isaiah', jer: 'Jeremiah', lam: 'Lamentations', ezek: 'Ezekiel',
  dan: 'Daniel', hos: 'Hosea', obad: 'Obadiah', mic: 'Micah', nah: 'Nahum', hab: 'Habakkuk', zeph: 'Zephaniah', hag: 'Haggai', zech: 'Zechariah', mal: 'Malachi',
  matt: 'Matthew', mt: 'Matthew', mk: 'Mark', lk: 'Luke', jn: 'John', rom: 'Romans', gal: 'Galatians', eph: 'Ephesians', phil: 'Philippians', col: 'Colossians',
  heb: 'Hebrews', jas: 'James', rev: 'Revelation', revelations: 'Revelation', 'the revelation': 'Revelation', philem: 'Philemon' };
const NUMBERED = { cor: 'Corinthians', thess: 'Thessalonians', tim: 'Timothy', pet: 'Peter', sam: 'Samuel', kgs: 'Kings', chron: 'Chronicles', jn: 'John' };

export function bookIndex(name) {
  let n = String(name || '').trim().replace(/\.$/, '').replace(/\s+/g, ' ');
  n = n.replace(/^(I{1,3})\s/i, (m, r) => r.length + ' ').replace(/^(First|Second|Third)\s/i, (m, w) => ({ first: 1, second: 2, third: 3 }[w.toLowerCase()]) + ' ');
  const exact = BOOKS.findIndex((b) => b.toLowerCase() === n.toLowerCase());
  if (exact >= 0) return exact;
  const low = n.toLowerCase();
  if (ALIAS[low]) return BOOKS.indexOf(ALIAS[low]);
  const m = low.match(/^([1-3]) ?([a-z]+)$/);
  if (m && NUMBERED[m[2]]) return BOOKS.indexOf(m[1] + ' ' + NUMBERED[m[2]]);
  return -1;
}

// "Romans 8:28", "Psalm 23", "1 John 4:1-6", "Isaiah 41:10–13" -> { b, book, c, v1, v2, label } or null.
export function parseRef(ref) {
  const m = String(ref || '').trim().replace(/[–—]/g, '-').match(/^((?:[1-3]|I{1,3}|First|Second|Third)?\s?[A-Za-z][A-Za-z .]*?)\s+(\d{1,3})(?::(\d{1,3})(?:\s?-\s?(\d{1,3}))?)?$/);
  if (!m) return null;
  const b = bookIndex(m[1]);
  if (b < 0) return null;
  const c = +m[2], v1 = m[3] ? +m[3] : 0, v2 = m[4] ? +m[4] : v1;
  if (c < 1 || (v1 && v2 < v1)) return null;
  const book = BOOKS[b];
  const label = (book === 'Psalms' ? 'Psalm' : book) + ' ' + c + (v1 ? ':' + v1 + (v2 > v1 ? '–' + v2 : '') : '');
  return { b, book, c, v1, v2, label };
}

const cache = {};
export async function loadBook(b) {
  if (!cache[b]) cache[b] = fetch('/kjv/' + b + '.json').then((r) => { if (!r.ok) throw new Error('Could not open the Bible'); return r.json(); }).catch((e) => { delete cache[b]; throw e; });
  return cache[b];
}

// Exact KJV text for a reference: { label, verses: [[n, text]], ok }. At most `max` verses (whole chapter when no verse given).
export async function passage(ref, max = 12) {
  const r = typeof ref === 'string' ? parseRef(ref) : ref;
  if (!r) return { ok: false, label: String(ref || '') };
  const book = await loadBook(r.b);
  const ch = book[r.c - 1];
  if (!ch) return { ok: false, label: r.label };
  const from = r.v1 || 1, to = r.v1 ? Math.min(r.v2, ch.length, from + max - 1) : Math.min(ch.length, max);
  if (from > ch.length) return { ok: false, label: r.label };
  const verses = []; for (let v = from; v <= to; v++) verses.push([v, ch[v - 1]]);
  return { ok: true, label: r.label, ref: r, verses, chapterLength: ch.length, chapters: book.length };
}

// Find scripture references inside free text (used to show the exact words beside Selah's answers).
const NAMES = BOOKS.map((b) => b.replace(/^([1-3]) /, '$1 ?')).concat(['Psalm', 'Song of Songs']).sort((a, b) => b.length - a.length).join('|');
const REF_RE = new RegExp('\\b(' + NAMES + ')\\s+(\\d{1,3}):(\\d{1,3})(?:\\s?[-–]\\s?(\\d{1,3}))?', 'g');
export function findRefs(text) {
  const out = []; const seen = new Set(); let m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(String(text || '')))) { const r = parseRef(m[0]); if (r && !seen.has(r.label)) { seen.add(r.label); out.push(r); } }
  return out;
}
