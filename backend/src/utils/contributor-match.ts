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

export function transliterate(text: string): string {
  return text.split('').map(ch => CYR_TO_LAT[ch] || ch).join('');
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

export function isBotOrCI(name: string, email: string): boolean {
  const patterns = ['jenkins', 'gitlab-ci', 'pipeline', 'bot', 'ci@', 'noreply', 'deploy', 'runner', 'automated', 'system', 'admin@'];
  const nl = name.toLowerCase(), el = email.toLowerCase();
  return patterns.some(p => nl.includes(p) || el.includes(p));
}
