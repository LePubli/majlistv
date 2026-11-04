"""Traduction mécanique des renvois (takhrij) de rn0x/hisn_almuslim_json : noms de recueils et formules usuelles → français.
Aucun contenu n'est ajouté : tout ce qui n'est pas reconnu reste en arabe (et la fiche de relecture montre le renvoi d'origine)."""
import re
import unicodedata

_STRIP = re.compile(r'[ً-ٰٟـ]')


def _n(s):
    s = _STRIP.sub('', unicodedata.normalize('NFC', s))
    return s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ٱ', 'ا').replace('ى', 'ي').replace('ة', 'ه').replace('‌', '').replace('‏', '')


# (arabe normalisé, français) — les plus longs d'abord.
PAIRS = [
    ('احمد بن حنبل', 'Ahmad'), ('الادب المفرد', 'al-Adab al-mufrad'), ('عمل اليوم والليله', '‘Amal al-yawm wa-l-layla'),
    ('صحيح الترغيب والترهيب', 'Sahih at-Targhib wa-t-Tarhib'), ('صحيح الجامع الصغير', 'Sahih al-Jami‘'), ('صحيح الجامع', 'Sahih al-Jami‘'),
    ('ضعيف الجامع', 'Da‘if al-Jami‘'), ('السلسله الصحيحه', 'as-Silsila as-sahiha'), ('صحيح ابن ماجه', 'Sahih Ibn Majah'), ('صحيح ابن ماجة', 'Sahih Ibn Majah'),
    ('صحيح الترمذي', 'Sahih at-Tirmidhi'), ('صحيح ابي داود', 'Sahih Abi Dawud'), ('صحيح ابو داود', 'Sahih Abi Dawud'), ('صحيح النسائي', 'Sahih an-Nasa’i'),
    ('صحيح الادب المفرد', 'Sahih al-Adab al-mufrad'), ('صحيح البخاري', 'Sahih al-Bukhari'), ('صحيح مسلم', 'Sahih Muslim'), ('ارواء الغليل', 'Irwa’ al-ghalil'),
    ('الاروء', 'Irwa’'), ('الارواء', 'Irwa’'), ('تحفه الاخيار', 'Tuhfat al-akhyar'), ('فتح الباري', 'Fath al-Bari'), ('زاد المعاد', 'Zad al-Ma‘ad'),
    ('مختصر شمائل الترمذي', 'Mukhtasar ash-Shama’il d’at-Tirmidhi'), ('تخريج الاذكار', 'Takhrij al-adhkar'), ('اهل السنن', 'les auteurs des Sunan'),
    ('اصحاب السنن', 'les auteurs des Sunan'), ('ابن السني', 'Ibn as-Sunni'), ('ابن حبان', 'Ibn Hibban'), ('ابن ماجه', 'Ibn Majah'), ('ابن ماجة', 'Ibn Majah'),
    ('ابي داود', 'Abu Dawud'), ('ابو داود', 'Abu Dawud'), ('الترمذي', 'at-Tirmidhi'), ('النسائي', 'an-Nasa’i'), ('البخاري', 'al-Bukhari'), ('مسلم', 'Muslim'),
    ('الحاكم', 'al-Hakim'), ('الطبراني', 'at-Tabarani'), ('البيهقي', 'al-Bayhaqi'), ('البغوي', 'al-Baghawi'), ('الدارمي', 'ad-Darimi'), ('مالك', 'Malik'),
    ('الذهبي', 'adh-Dhahabi'), ('الالباني', 'al-Albani'), ('ابن باز', 'Ibn Baz'), ('ابن حجر', 'Ibn Hajar'), ('ابن القيم', 'Ibn al-Qayyim'),
    ('احمد', 'Ahmad'), ('وانظر', 'voir'), ('انظر', 'voir'), ('اخرجه', 'rapporté par'), ('رواه', 'rapporté par'), ('وصححه', 'jugé sahih par'), ('صححه', 'jugé sahih par'),
    ('وحسنه', 'jugé hassan par'), ('حسنه', 'jugé hassan par'), ('وضعفه', 'jugé faible par'), ('ووافقه', 'approuvé par'), ('برقم', 'n°'), ('رقم', 'n°'),
    ('ووافقه الذهبي', 'approuvé par adh-Dhahabi'), ('وغيره', 'et d’autres'), ('وغيرهم', 'et d’autres'), ('متفق عليه', 'unanimement reconnu'), ('في', 'dans'),
    ('ص', 'p.'), ('و', 'et'),
]
PAIRS.sort(key=lambda p: -len(p[0]))
AR = re.compile(r'[؀-ۿ]')


def translate(note):
    """Renvoi arabe → français. Retourne (texte, complet) ; complet = plus aucune lettre arabe."""
    s = re.sub(r'\s+', ' ', unicodedata.normalize('NFC', note)).strip()
    out, i = [], 0
    ns = _n(s)
    # On parcourt mot à mot pour ne remplacer que des mots entiers (le « و » collé est traité à part).
    words = s.split(' ')
    res = []
    for w in words:
        nw = _n(w)
        pre = ''
        if nw.startswith('و') and len(nw) > 1 and not any(nw == p[0] for p in PAIRS):
            cand = nw[1:]
            if any(cand == p[0] for p in PAIRS) or re.match(r'^[\d/،,.]+$', cand):
                pre, nw = 'et ', cand
        hit = next((p[1] for p in PAIRS if p[0] == nw), None)
        if hit is None:
            m = re.match(r'^([^\d/،,.:؛;()]+)([\d/،,.:؛;()]+.*)$', nw)
            if m and any(m.group(1) == p[0] for p in PAIRS):
                hit = next(p[1] for p in PAIRS if p[0] == m.group(1)) + m.group(2)
        res.append(pre + (hit if hit is not None else w))
    txt = ' '.join(res)
    txt = re.sub(r'\s*،\s*', ', ', txt)
    txt = re.sub(r'(\d)\s*/\s*(\d)', r'\1/\2', txt)
    txt = re.sub(r'\s+', ' ', txt).strip()
    return txt, not AR.search(txt)
