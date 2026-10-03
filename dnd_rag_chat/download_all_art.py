import os
import re
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(BASE_DIR, 'assets', 'images')
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'dnd_2024_regras_ptbr'))

RAW_URL_BASE = 'https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main'
API_URL_BASE = 'https://api.github.com/repos/5etools-mirror-2/5etools-img/contents'

HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}

import unicodedata

def normalize(text):
    if not text:
        return ''
    nfd = unicodedata.normalize('NFD', text.lower())
    without_accents = ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]', '', without_accents)

def fetch_folder_items(folder_path):
    url = f"{API_URL_BASE}/{folder_path}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return [d['name'] for d in data if d['type'] == 'file' and d['name'].endswith(('.webp', '.png', '.jpg'))]
    except Exception as e:
        print(f"Error fetching folder {folder_path}: {e}")
        return []

def download_file(raw_rel_path, target_local_path):
    if os.path.exists(target_local_path) and os.path.getsize(target_local_path) > 100:
        return target_local_path
    
    encoded_rel = urllib.parse.quote(raw_rel_path)
    url = f"{RAW_URL_BASE}/{encoded_rel}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
        os.makedirs(os.path.dirname(target_local_path), exist_ok=True)
        with open(target_local_path, 'wb') as fp:
            fp.write(content)
        return target_local_path
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        return None

def main():
    print("=== D&D 2024 Image Downloader & Catalog Builder ===")
    os.makedirs(IMAGES_DIR, exist_ok=True)
    
    catalog = {} # maps norm_key -> relative_url

    # 1. Classes & Subclasses (XPHB)
    print("\n[1/5] Fetching Classes & Subclasses (XPHB)...")
    classes_files = fetch_folder_items('classes/XPHB')
    print(f"Found {len(classes_files)} files in classes/XPHB.")
    
    class_downloads = []
    classes_target = os.path.join(IMAGES_DIR, 'classes')
    for fn in classes_files:
        raw_path = f"classes/XPHB/{fn}"
        local_path = os.path.join(classes_target, fn.lower().replace(' ', '_'))
        web_path = f"/assets/images/classes/{fn.lower().replace(' ', '_')}"
        class_downloads.append((raw_path, local_path, fn, web_path))
    
    # 2. Races / Species (XPHB)
    print("\n[2/5] Fetching Races & Species (XPHB)...")
    races_files = fetch_folder_items('races/XPHB')
    print(f"Found {len(races_files)} files in races/XPHB.")
    races_downloads = []
    races_target = os.path.join(IMAGES_DIR, 'races')
    for fn in races_files:
        raw_path = f"races/XPHB/{fn}"
        local_path = os.path.join(races_target, fn.lower().replace(' ', '_'))
        web_path = f"/assets/images/races/{fn.lower().replace(' ', '_')}"
        races_downloads.append((raw_path, local_path, fn, web_path))

    # 3. Conditions (PHB)
    print("\n[3/5] Fetching Conditions (PHB)...")
    conditions_files = fetch_folder_items('conditionsdiseases/PHB')
    print(f"Found {len(conditions_files)} files in conditionsdiseases/PHB.")
    cond_downloads = []
    cond_target = os.path.join(IMAGES_DIR, 'conditions')
    for fn in conditions_files:
        raw_path = f"conditionsdiseases/PHB/{fn}"
        local_path = os.path.join(cond_target, fn.lower().replace(' ', '_'))
        web_path = f"/assets/images/conditions/{fn.lower().replace(' ', '_')}"
        cond_downloads.append((raw_path, local_path, fn, web_path))

    # 4. Items & Weapons (XPHB)
    print("\n[4/5] Fetching Weapons & Items (XPHB)...")
    items_files = fetch_folder_items('items/XPHB')
    print(f"Found {len(items_files)} files in items/XPHB.")
    items_downloads = []
    items_target = os.path.join(IMAGES_DIR, 'items')
    for fn in items_files:
        raw_path = f"items/XPHB/{fn}"
        local_path = os.path.join(items_target, fn.lower().replace(' ', '_'))
        web_path = f"/assets/images/items/{fn.lower().replace(' ', '_')}"
        items_downloads.append((raw_path, local_path, fn, web_path))

    # 5. Spells (XPHB)
    print("\n[5/6] Fetching Spells (XPHB)...")
    spells_files = fetch_folder_items('spells/XPHB')
    print(f"Found {len(spells_files)} files in spells/XPHB.")
    spells_downloads = []
    spells_target = os.path.join(IMAGES_DIR, 'spells')
    for fn in spells_files:
        raw_path = f"spells/XPHB/{fn}"
        local_path = os.path.join(spells_target, fn.lower().replace(' ', '_'))
        web_path = f"/assets/images/spells/{fn.lower().replace(' ', '_')}"
        spells_downloads.append((raw_path, local_path, fn, web_path))

    # 6. Bestiary / Monsters (XMM and MM matching local 339 monsters)
    print("\n[6/6] Mapping & Fetching Monsters (XMM + MM)...")
    xmm_files = {normalize(fn.replace('.webp', '')): (f"bestiary/XMM/{fn}", fn) for fn in fetch_folder_items('bestiary/XMM')}
    mm_files = {normalize(fn.replace('.webp', '')): (f"bestiary/MM/{fn}", fn) for fn in fetch_folder_items('bestiary/MM')}
    
    # Read local monster files
    monsters_dir = os.path.join(DATA_DIR, '08_monstros')
    monster_downloads = []
    monsters_target = os.path.join(IMAGES_DIR, 'monsters')
    
    if os.path.exists(monsters_dir):
        for f in os.listdir(monsters_dir):
            if f.endswith('.md') and f != 'README.md':
                with open(os.path.join(monsters_dir, f), 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()
                m_t = re.search(r'title:\s*\"([^\"]+)\"', content)
                title_pt = m_t.group(1) if m_t else ''
                m_en = re.search(r'title_en:\s*\"([^\"]+)\"', content)
                title_en = m_en.group(1) if m_en else f.replace('.md', '').replace('_', ' ')
                slug = f.replace('.md', '')
                
                # Matching strategy: XMM first (2024), then MM
                found = None
                for key in [normalize(title_en), normalize(slug), normalize(title_pt)]:
                    if key in xmm_files:
                        found = xmm_files[key]
                        break
                    elif key in mm_files:
                        found = mm_files[key]
                        break
                
                # Fuzzy fallback (e.g. "Adult Red Dragon" vs "Red Dragon")
                if not found:
                    for key in [normalize(title_en), normalize(slug)]:
                        for mk, val in xmm_files.items():
                            if key in mk or mk in key:
                                found = val
                                break
                        if found: break
                        for mk, val in mm_files.items():
                            if key in mk or mk in key:
                                found = val
                                break
                        if found: break

                if found:
                    raw_path, fn = found
                    clean_local_name = f"{slug}.webp"
                    local_path = os.path.join(monsters_target, clean_local_name)
                    web_path = f"/assets/images/monsters/{clean_local_name}"
                    monster_downloads.append((raw_path, local_path, title_pt, title_en, slug, web_path))

    print(f"Matched {len(monster_downloads)} monsters to download!")

    # Pool all downloads
    all_downloads = []
    
    for raw_p, loc_p, orig_fn, web_p in class_downloads:
        all_downloads.append((raw_p, loc_p))
        base_name = orig_fn.replace('.webp', '')
        catalog[normalize(base_name)] = web_p
        catalog[normalize(orig_fn)] = web_p
    
    for raw_p, loc_p, orig_fn, web_p in races_downloads:
        all_downloads.append((raw_p, loc_p))
        base_name = orig_fn.replace('.webp', '')
        catalog[normalize(base_name)] = web_p
        catalog[normalize(orig_fn)] = web_p

    for raw_p, loc_p, orig_fn, web_p in cond_downloads:
        all_downloads.append((raw_p, loc_p))
        base_name = orig_fn.replace('.webp', '')
        catalog[normalize(base_name)] = web_p
    
    # Portuguese translations for conditions
    cond_pt_map = {
        'blinded': ['cego', 'cegueira'],
        'charmed': ['enfeiticado', 'encantado'],
        'deafened': ['surdo', 'surdez'],
        'frightened': ['amedrontado', 'assustado', 'medo'],
        'grappled': ['agarrado'],
        'invisible': ['invisivel', 'invisibilidade'],
        'paralyzed': ['paralisado', 'paralisia'],
        'petrified': ['petrificado', 'petrificacao'],
        'poisoned': ['envenenado', 'envenenamento'],
        'prone': ['caido', 'prostrado'],
        'restrained': ['impedido', 'contido', 'preso'],
        'stunned': ['atordoado', 'atordoamento'],
        'unconscious': ['inconsciente', 'inconsciencia']
    }
    for eng_cond, pt_list in cond_pt_map.items():
        if normalize(eng_cond) in catalog:
            w_path = catalog[normalize(eng_cond)]
            for pt_c in pt_list:
                catalog[normalize(pt_c)] = w_path

    # Portuguese translations for classes & races
    class_pt_map = {
        'barbarian': 'barbaro', 'bard': 'bardo', 'cleric': 'clerigo',
        'druid': 'druida', 'fighter': 'guerreiro', 'monk': 'monge',
        'paladin': 'paladino', 'ranger': 'guardiao', 'ranger2': 'patrulheiro',
        'rogue': 'ladino', 'sorcerer': 'feiticeiro', 'warlock': 'bruxo', 'wizard': 'mago'
    }
    for eng, pt in class_pt_map.items():
        if normalize(eng) in catalog:
            catalog[normalize(pt)] = catalog[normalize(eng)]

    race_pt_map = {
        'human': 'humano', 'elf': 'elfo', 'dwarf': 'anao', 'halfling': 'halfling',
        'dragonborn': 'draconato', 'gnome': 'gnomo', 'tiefling': 'tiefling',
        'orc': 'orc', 'goliath': 'golias', 'aasimar': 'aasimar'
    }
    for eng, pt in race_pt_map.items():
        if normalize(eng) in catalog:
            catalog[normalize(pt)] = catalog[normalize(eng)]

    for raw_p, loc_p, orig_fn, web_p in items_downloads:
        all_downloads.append((raw_p, loc_p))
        base_name = orig_fn.replace('.webp', '')
        catalog[normalize(base_name)] = web_p

    for raw_p, loc_p, orig_fn, web_p in spells_downloads:
        all_downloads.append((raw_p, loc_p))
        base_name = orig_fn.replace('.webp', '')
        catalog[normalize(base_name)] = web_p

    for raw_p, loc_p, title_pt, title_en, slug, web_p in monster_downloads:
        all_downloads.append((raw_p, loc_p))
        if title_pt: catalog[normalize(title_pt)] = web_p
        if title_en: catalog[normalize(title_en)] = web_p
        if slug: catalog[normalize(slug)] = web_p

    print(f"\n🚀 Starting concurrent download of {len(all_downloads)} images with 12 workers...")
    success = 0
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {executor.submit(download_file, r_p, l_p): (r_p, l_p) for r_p, l_p in all_downloads}
        for future in as_completed(futures):
            res = future.result()
            if res:
                success += 1

    print(f"✅ Successfully downloaded {success}/{len(all_downloads)} images!")

    # Save catalog
    catalog_path = os.path.join(IMAGES_DIR, 'image_catalog.json')
    with open(catalog_path, 'w', encoding='utf-8') as fp:
        json.dump(catalog, fp, ensure_ascii=False, indent=2)
    
    print(f"📖 Image catalog saved to {catalog_path} with {len(catalog)} index keys.")

if __name__ == '__main__':
    main()
