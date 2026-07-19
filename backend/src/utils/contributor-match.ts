const CYR_TO_LAT: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
  'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
};

const LAT_TO_CYR: Record<string, string> = {
  'shch': 'щ', 'zh': 'ж', 'kh': 'х', 'ts': 'ц', 'ch': 'ч',
  'yu': 'ю', 'ya': 'я', 'yo': 'ё',
  'sh': 'ш',
  'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е',
  'z': 'з', 'i': 'и', 'y': 'й', 'k': 'к', 'l': 'л', 'm': 'м',
  'n': 'н', 'o': 'о', 'p': 'п', 'r': 'р', 's': 'с', 't': 'т',
  'u': 'у', 'f': 'ф', 'x': 'х', 'c': 'ц', 'w': 'в',
};

export function transliterate(text: string): string {
  return text.split('').map(ch => CYR_TO_LAT[ch] || ch).join('');
}

export function transliterateToCyrillic(text: string): string {
  const result: string[] = [];
  let i = 0;
  const lower = text.toLowerCase();
  while (i < lower.length) {
    let matched = false;
    for (const length of [4, 3, 2, 1]) {
      const chunk = lower.slice(i, i + length);
      if (LAT_TO_CYR[chunk]) {
        result.push(text[i] === text[i].toUpperCase() ? LAT_TO_CYR[chunk].toUpperCase() : LAT_TO_CYR[chunk]);
        i += length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.push(text[i]);
      i++;
    }
  }
  return result.join('');
}

export function soundex(name: string): string {
  if (!name) return '';
  const upper = transliterate(name).toUpperCase();
  if (!upper) return '';

  const mapping: Record<string, string> = {
    'B': '1', 'F': '1', 'P': '1', 'V': '1',
    'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
    'D': '3', 'T': '3',
    'L': '4',
    'M': '5', 'N': '5',
    'R': '6',
  };

  const result = [upper[0]];
  let prev = mapping[upper[0]] || '0';

  for (const ch of upper.slice(1)) {
    const code = mapping[ch] || '0';
    if (code !== '0' && code !== prev) {
      result.push(code);
      prev = code;
    } else if (code === '0') {
      prev = code;
    }
  }

  return (result.slice(0, 4).join('') + '000').slice(0, 4);
}

export function normalizeName(name: string): string {
  return transliterate(name.toLowerCase().trim()).replace(/\s+/g, ' ')
    .replace(/\s*\d+$/, '').replace(/\s*\(.*?\)/, '').trim();
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim().replace(/^[+\d]+@/, '');
}

export function emailLocalPart(email: string): string {
  return email.split('@')[0].toLowerCase().replace(/[._\-]/g, '');
}

function nameParts(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return [parts[0], parts[parts.length - 1]];
  return [parts[0] || '', ''];
}

export function isSimilarName(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (n1 === n2) return true;
  if (soundex(n1) === soundex(n2) && soundex(n1) !== '') return true;
  const [first1, last1] = nameParts(n1);
  const [first2, last2] = nameParts(n2);
  if (first1 && first2 && first1 === first2 && last1 && last2 && last1 === last2) return true;
  if (n1.length >= 3 && n2.length >= 3 && (n1.includes(n2) || n2.includes(n1))) return true;
  if (emailLocalPart(name1) === emailLocalPart(name2) && emailLocalPart(name1)) return true;
  return false;
}

export function isBotOrCI(name: string, email: string): boolean {
  const patterns = ['jenkins', 'gitlab-ci', 'pipeline', 'bot', 'ci@', 'noreply', 'deploy', 'runner', 'automated', 'system', 'admin@'];
  const nl = name.toLowerCase(), el = email.toLowerCase();
  return patterns.some(p => nl.includes(p) || el.includes(p));
}
