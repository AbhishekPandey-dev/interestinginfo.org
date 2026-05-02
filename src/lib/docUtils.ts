export function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, br, tr').forEach((el) => {
    el.append('\n');
  });
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

const STOPWORDS = new Set([
  'the','is','and','a','to','of','in','that','it','for','on','with','as','this','but','by','an',
  'be','are','was','were','or','at','from','have','has','had','not','you','your','we','our','they',
  'their','i','he','she','his','her','them','its','can','will','would','should','could','if','then',
  'than','so','do','does','did','been','being','about','into','over','also','any','all','more','most',
  'such','no','nor','only','own','same','too','very','s','t','just','up','down','out','off','because',
  'while','where','when','what','which','who','whom','how','why','these','those','there','here'
]);

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter((word) => word && word.length > 2 && !STOPWORDS.has(word));
}

export function summarize(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  const headings = Array.from(div.querySelectorAll('h1, h2, h3'))
    .map((el) => el.textContent?.trim() || '')
    .filter(Boolean);
  const headingsStr = headings.length > 0 ? headings.join(' - ') : '';

  const plain = htmlToPlainText(html);
  if (!plain) return 'No content to summarise.';

  const sentences = splitSentences(plain);
  if (sentences.length === 0) return 'No content to summarise.';

  const freq = new Map<string, number>();
  for (const word of tokenize(plain)) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  const scored = sentences.map((sentence, index) => {
    const words = tokenize(sentence);
    if (words.length === 0) return { idx: index, sentence, score: 0 };

    let score = 0;
    for (const word of words) score += freq.get(word) || 0;

    score = score / Math.sqrt(words.length);

    if (index < sentences.length * 0.1 || index >= sentences.length * 0.9) {
      score *= 1.4;
    }

    if (words.length < 5 || words.length > 50) {
      score *= 0.5;
    }

    let isNearHeading = false;
    for (const heading of headings) {
      if (heading && (sentence.includes(heading) || sentences[Math.max(0, index - 1)]?.includes(heading))) {
        isNearHeading = true;
        break;
      }
    }

    if (isNearHeading) {
      score *= 1.3;
    }

    return { idx: index, sentence, score };
  });

  const maxSentences = Math.max(8, Math.min(20, Math.floor(sentences.length * 0.07)));
  const sectionCount = Math.min(5, Math.max(2, Math.ceil(sentences.length / 6)));
  const perSection = Math.ceil(sentences.length / sectionCount);
  const picked = new Set<number>();

  for (let index = 0; index < sectionCount; index++) {
    const start = index * perSection;
    const end = Math.min(sentences.length, start + perSection);
    const slice = scored.slice(start, end).sort((a, b) => b.score - a.score);
    const take = slice.slice(0, Math.ceil(maxSentences / sectionCount));
    for (const item of take) picked.add(item.idx);
  }

  if (picked.size > maxSentences) {
    const sorted = Array.from(picked)
      .map((index) => scored[index])
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences);
    picked.clear();
    for (const item of sorted) picked.add(item.idx);
  }

  const ordered = Array.from(picked)
    .sort((a, b) => a - b)
    .map((index) => sentences[index]);

  let out = "Here's a summary of this document:\n\n";
  if (headingsStr) {
    out += `Topics covered: ${headingsStr}\n\n`;
  }
  out += ordered.map((sentence) => `- ${sentence}`).join('\n');
  out += '\n\nEnd of summary. Would you like me to read this aloud?';

  return out;
}

// Strip the prefix/suffix prose from a generated summary so TTS reads only the body.
export function extractSummaryBody(summary: string): string {
  return summary
    .replace(/^Here's a summary of this document:\s*/i, '')
    .replace(/End of summary\.[\s\S]*$/i, '')
    .trim();
}
