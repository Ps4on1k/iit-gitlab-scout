"""Contributor matching utilities: transliteration, soundex, name comparison."""

import re

# Cyrillic → Latin
CYR_TO_LAT = {
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
}

# Latin → Cyrillic (approximate, for common Russian transliterations)
LAT_TO_CYR = {
    'shch': 'щ', 'zh': 'ж', 'kh': 'х', 'ts': 'ц', 'ch': 'ч',
    'yu': 'ю', 'ya': 'я', 'yo': 'ё',
    'sh': 'ш', 'zh': 'ж',
    'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е',
    'z': 'з', 'i': 'и', 'y': 'й', 'k': 'к', 'l': 'л', 'm': 'м',
    'n': 'н', 'o': 'о', 'p': 'п', 'r': 'р', 's': 'с', 't': 'т',
    'u': 'у', 'f': 'ф', 'x': 'х', 'c': 'ц', 'w': 'в',
}


def transliterate_to_latin(text):
    """Transliterate Cyrillic text to Latin."""
    return "".join(CYR_TO_LAT.get(ch, ch) for ch in text)


def transliterate_to_cyrillic(text):
    """Approximate transliteration of Latin text to Cyrillic."""
    result = []
    i = 0
    text_lower = text.lower()
    while i < len(text_lower):
        matched = False
        for length in [4, 3, 2, 1]:
            chunk = text_lower[i:i + length]
            if chunk in LAT_TO_CYR:
                # Preserve case
                if text[i].isupper():
                    result.append(LAT_TO_CYR[chunk].upper())
                else:
                    result.append(LAT_TO_CYR[chunk])
                i += length
                matched = True
                break
        if not matched:
            result.append(text[i])
            i += 1
    return "".join(result)


def soundex(name):
    """American Soundex algorithm for phonetic matching.
    Converts name to 4-character code: first letter + 3 consonants.
    Examples: 'Владислав' → 'В143', 'Vladislav' → 'V143', 'Сергей' → 'C260'
    """
    if not name:
        return ""

    name = transliterate_to_latin(name).upper()
    if not name:
        return ""

    # Soundex mapping
    mapping = {
        'B': '1', 'F': '1', 'P': '1', 'V': '1',
        'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
        'D': '3', 'T': '3',
        'L': '4',
        'M': '5', 'N': '5',
        'R': '6',
    }

    result = [name[0]]
    prev = mapping.get(name[0], '0')

    for ch in name[1:]:
        code = mapping.get(ch, '0')
        if code != '0' and code != prev:
            result.append(code)
            prev = code
        elif code == '0':
            prev = code

    # Pad with zeros or truncate
    result = result[:4]
    while len(result) < 4:
        result.append('0')

    return "".join(result)


def normalize_name(name):
    """Normalize name for comparison: lowercase, trim, transliterate, clean."""
    name = transliterate_to_latin(name.lower().strip())
    name = " ".join(name.split())
    name = re.sub(r"\s*\d+$", "", name)
    name = re.sub(r"\s*\(.*?\)", "", name)
    return name.strip()


def normalize_email(email):
    """Normalize email for comparison."""
    return re.sub(r"^[+\d]+@", "", email.lower().strip())


def email_local_part(email):
    """Get local part of email, normalized."""
    return re.sub(r"[._\-]", "", email.split("@")[0].lower())


def name_parts(name):
    """Split name into first/last parts. Returns (first, last) or (name, '')."""
    parts = name.strip().split()
    if len(parts) >= 2:
        return parts[0], parts[-1]
    return parts[0] if parts else "", ""


def is_similar_name(name1, name2):
    """Check if two names are similar using multiple heuristics."""
    if not name1 or not name2:
        return False

    n1 = normalize_name(name1)
    n2 = normalize_name(name2)

    # Exact match
    if n1 == n2:
        return True

    # Soundex match
    if soundex(n1) == soundex(n2) and soundex(n1) != "":
        return True

    # First name + last name match
    first1, last1 = name_parts(n1)
    first2, last2 = name_parts(n2)
    if first1 and first2 and first1 == first2 and last1 and last2 and last1 == last2:
        return True

    # One name contains the other (handles abbreviations)
    if len(n1) >= 3 and len(n2) >= 3:
        if n1 in n2 or n2 in n1:
            return True

    # Email local parts match
    if email_local_part(name1) == email_local_part(name2) and email_local_part(name1):
        return True

    return False


def is_bot_or_ci(name, email):
    """Check if author is a bot/CI system."""
    patterns = [
        "jenkins", "gitlab-ci", "pipeline", "bot", "ci@", "noreply",
        "deploy", "runner", "automated", "system", "admin@",
    ]
    nl, el = name.lower(), email.lower()
    return any(p in nl or p in el for p in patterns)
