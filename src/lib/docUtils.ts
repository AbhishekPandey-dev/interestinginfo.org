type DocumentBlock = {
  text: string;
  type: 'heading' | 'paragraph' | 'list';
  level: number;
  order: number;
  section: string;
};

type ScoredSentence = {
  sentence: string;
  score: number;
  order: number;
  section: string;
};

const STOPWORDS = new Set([
  'the','is','and','a','to','of','in','that','it','for','on','with','as','this','but','by','an',
  'be','are','was','were','or','at','from','have','has','had','not','you','your','we','our','they',
  'their','i','he','she','his','her','them','its','can','will','would','should','could','if','then',
  'than','so','do','does','did','been','being','about','into','over','also','any','all','more','most',
  'such','no','nor','only','own','same','too','very','s','t','just','up','down','out','off','because',
  'while','where','when','what','which','who','whom','how','why','these','those','there','here',
  'may','might','must','shall','within','without','between','among','including','include','includes',
]);

const IMPORTANT_CUES = [
  'important',
  'significant',
  'challenge',
  'issue',
  'risk',
  'problem',
  'impact',
  'concern',
  'privacy',
  'security',
  'accountability',
  'transparency',
  'governance',
  'regulation',
  'law',
  'rights',
  'data',
  'decision',
  'benefit',
  'however',
  'therefore',
  'because',
  'requires',
  'should',
  'must',
];

const MAX_SUMMARY_BULLETS = 7;
const MAX_SECTION_HIGHLIGHTS = 4;

function cleanText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .trim();
}

function isBoilerplate(text: string): boolean {
  const normalised = cleanText(text).toLowerCase();
  return (
    normalised.length < 4 ||
    /^page\s+\d+/.test(normalised) ||
    /^\d+$/.test(normalised) ||
    /^office of the victorian information commissioner$/.test(normalised) ||
    /^ovic$/.test(normalised)
  );
}

export function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  div.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, br, tr').forEach((el) => {
    el.append('\n');
  });
  return cleanText(div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function extractBlocks(html: string): DocumentBlock[] {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script, style, noscript').forEach((el) => el.remove());

  const blocks: DocumentBlock[] = [];
  const seen = new Set<string>();
  let currentSection = '';
  let order = 0;

  div.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const text = cleanText(el.textContent || '');
    if (isBoilerplate(text)) return;

    const isHeading = /^h[1-6]$/.test(tag);
    const key = `${tag}:${text.toLowerCase()}`;
    if (!isHeading && seen.has(key)) return;
    seen.add(key);

    if (isHeading) {
      currentSection = text;
    }

    blocks.push({
      text,
      type: isHeading ? 'heading' : tag === 'li' ? 'list' : 'paragraph',
      level: isHeading ? Number(tag.slice(1)) : 0,
      order: order++,
      section: currentSection,
    });
  });

  if (blocks.length > 0) return blocks;

  return htmlToPlainText(html)
    .split(/\n+/)
    .map(cleanText)
    .filter((text) => !isBoilerplate(text))
    .map((text, index) => ({
      text,
      type: 'paragraph',
      level: 0,
      order: index,
      section: '',
    }));
}

function splitSentences(text: string): string[] {
  return cleanText(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .flatMap((sentence) => {
      if (sentence.length <= 220) return [sentence];
      return sentence.split(/;\s+|:\s+(?=[A-Z])/);
    })
    .map(cleanText)
    .filter((sentence) => sentence.length > 24 && sentence.length < 420);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter((word) => word && word.length > 2 && !STOPWORDS.has(word));
}

function titleFromBlocks(blocks: DocumentBlock[]): string {
  const firstH1 = blocks.find((block) => block.type === 'heading' && block.level === 1);
  const firstHeading = blocks.find((block) => block.type === 'heading');
  return firstH1?.text || firstHeading?.text || 'this document';
}

function selectTopics(blocks: DocumentBlock[]): string[] {
  const headings = blocks
    .filter((block) => block.type === 'heading')
    .map((block) => block.text)
    .filter((heading) => heading.length <= 90);

  const seen = new Set<string>();
  return headings.filter((heading) => {
    const key = heading.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFrequencyMap(blocks: DocumentBlock[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const block of blocks) {
    const weight = block.type === 'heading' ? 3 : block.type === 'list' ? 1.35 : 1;
    for (const word of tokenize(block.text)) {
      freq.set(word, (freq.get(word) || 0) + weight);
    }
  }
  return freq;
}

function scoreSentences(blocks: DocumentBlock[], title: string): ScoredSentence[] {
  const freq = buildFrequencyMap(blocks);
  const titleWords = new Set(tokenize(title));
  const documentLength = Math.max(1, blocks.length);
  const seenSentences = new Set<string>();
  const scored: ScoredSentence[] = [];

  for (const block of blocks) {
    if (block.type === 'heading') continue;

    for (const sentence of splitSentences(block.text)) {
      const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seenSentences.has(key)) continue;
      seenSentences.add(key);

      const words = tokenize(sentence);
      if (words.length < 5) continue;

      let score = 0;
      for (const word of words) {
        score += freq.get(word) || 0;
        if (titleWords.has(word)) score += 2;
      }

      score = score / Math.sqrt(words.length);

      const lower = sentence.toLowerCase();
      for (const cue of IMPORTANT_CUES) {
        if (lower.includes(cue)) score += 1.4;
      }

      if (block.type === 'list') score += 1.1;
      if (block.section) score += 0.8;
      if (block.order < documentLength * 0.18) score += 1.15;
      if (block.order > documentLength * 0.78) score += 0.55;

      scored.push({
        sentence,
        score,
        order: block.order,
        section: block.section,
      });
    }
  }

  return scored;
}

function chooseDiverseSentences(scored: ScoredSentence[], count: number): ScoredSentence[] {
  const selected: ScoredSentence[] = [];
  const sectionUse = new Map<string, number>();

  for (const item of [...scored].sort((a, b) => b.score - a.score)) {
    const sectionKey = item.section || 'General';
    if ((sectionUse.get(sectionKey) || 0) >= 2) continue;

    const tooSimilar = selected.some((existing) => similarity(existing.sentence, item.sentence) > 0.58);
    if (tooSimilar) continue;

    selected.push(item);
    sectionUse.set(sectionKey, (sectionUse.get(sectionKey) || 0) + 1);
    if (selected.length >= count) break;
  }

  return selected.sort((a, b) => a.order - b.order);
}

function similarity(a: string, b: string): number {
  const aWords = new Set(tokenize(a));
  const bWords = new Set(tokenize(b));
  if (!aWords.size || !bWords.size) return 0;

  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap++;
  }

  return overlap / Math.min(aWords.size, bWords.size);
}

function buildSectionHighlights(scored: ScoredSentence[]): string[] {
  const bestBySection = new Map<string, ScoredSentence>();

  for (const item of scored) {
    const section = item.section;
    if (!section || section.length > 90) continue;

    const existing = bestBySection.get(section);
    if (!existing || item.score > existing.score) {
      bestBySection.set(section, item);
    }
  }

  return [...bestBySection.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, MAX_SECTION_HIGHLIGHTS)
    .map(([section, item]) => `${section}: ${item.sentence}`);
}

export function summarize(html: string): string {
  const blocks = extractBlocks(html);
  if (!blocks.length) return 'No content to summarise.';

  const title = titleFromBlocks(blocks);
  const topics = selectTopics(blocks).filter((topic) => topic !== title).slice(0, 6);
  const scored = scoreSentences(blocks, title);

  if (!scored.length) {
    return `Summary\n\nThis document is about ${title}.\n\nI could not find enough paragraph text to create a detailed summary.`;
  }

  const keyPoints = chooseDiverseSentences(scored, MAX_SUMMARY_BULLETS);
  const sectionHighlights = buildSectionHighlights(scored);
  const opening = keyPoints[0]?.sentence || `${title} is the main focus of the document.`;

  const lines = [
    'Summary',
    '',
    `This document focuses on ${title}. ${opening}`,
  ];

  if (topics.length > 0) {
    lines.push('', `Main topics: ${topics.join(', ')}.`);
  }

  lines.push('', 'Key points:');
  for (const point of keyPoints) {
    lines.push(`- ${point.sentence}`);
  }

  if (sectionHighlights.length > 0) {
    lines.push('', 'Section highlights:');
    for (const highlight of sectionHighlights) {
      lines.push(`- ${highlight}`);
    }
  }

  lines.push('', 'Would you like me to read this summary aloud?');

  return lines.join('\n');
}

// Strip helper headings from a generated summary so TTS reads only the useful content.
export function extractSummaryBody(summary: string): string {
  return summary
    .replace(/^Summary\s*/i, '')
    .replace(/Would you like me to read this summary aloud\?\s*$/i, '')
    .trim();
}
