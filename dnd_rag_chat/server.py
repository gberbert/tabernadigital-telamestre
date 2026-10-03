import os
import re
import ssl
import json
import time
import random
import unicodedata
import urllib.request
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(APP_DIR, "..", "dnd_2024_regras_ptbr"))

PORT = 8080
MODEL_NAME = "gemini-3.5-flash-lite"

# Carrega API Key do ambiente ou arquivo .env
API_KEY = os.getenv("GEMINI_API_KEY", "")
if not API_KEY:
    for env_candidate in [os.path.join(APP_DIR, ".env"), os.path.join(APP_DIR, "..", ".env")]:
        if os.path.exists(env_candidate):
            try:
                with open(env_candidate, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEY="):
                            API_KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
                            break
            except Exception:
                pass
        if API_KEY:
            break


SSL_CTX = ssl._create_unverified_context()

PORTUGUESE_STOP_WORDS = {
    'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
    'um', 'uma', 'uns', 'umas', 'por', 'para', 'com', 'sem', 'sob', 'sobre', 'que', 'se',
    'e', 'ou', 'mas', 'como', 'qual', 'quais', 'quem', 'este', 'esta', 'estes', 'estas',
    'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela', 'aqueles', 'aquelas', 'seu', 'sua',
    'seus', 'suas', 'meu', 'minha', 'meus', 'minhas', 'teu', 'tua', 'teus', 'tuas', 'nosso',
    'nossa', 'nossos', 'nossas', 'liste', 'listar', 'lista', 'todos', 'todas', 'existentes',
    'existente', 'tem', 'temos', 'ha', 'haver', 'sao', 'ser', 'esta', 'estao', 'ao', 'aos',
    'pelo', 'pela', 'pelos', 'pelas', 'num', 'numa', 'nuns', 'numas', 'me', 'te', 'lhe',
    'nos', 'vos', 'lhes', 'dele', 'dela', 'deles', 'delas', 'nele', 'nela', 'neles', 'nelas'
}

# ----------------------------------------------------
# Image Catalog Manager (Standardized D&D 2024 Art)
# ----------------------------------------------------
IMAGE_CATALOG_PATH = os.path.join(APP_DIR, 'assets', 'images', 'image_catalog.json')
IMAGE_CATALOG = {}
if os.path.exists(IMAGE_CATALOG_PATH):
    try:
        with open(IMAGE_CATALOG_PATH, 'r', encoding='utf-8') as fp:
            IMAGE_CATALOG = json.load(fp)
        print(f"[IMAGES] Loaded {len(IMAGE_CATALOG)} artwork references from catalog.", flush=True)
    except Exception as e:
        print(f"[IMAGES] Warning loading catalog: {e}", flush=True)

def clean_text(s):
    if not s:
        return ''
    nfd = unicodedata.normalize('NFD', s.lower())
    without_accents = ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]', '', without_accents)

def get_item_image(title, title_en=None, slug=None):
    candidates = [c for c in [title, title_en, slug] if c]
    # 1. Exact match
    for term in candidates:
        c = clean_text(term)
        if c and c in IMAGE_CATALOG:
            return IMAGE_CATALOG[c]
    # 2. Candidate inside key
    for term in candidates:
        c = clean_text(term)
        if not c or len(c) < 4: continue
        for k, v in IMAGE_CATALOG.items():
            if c in k:
                return v
    # 3. Key inside candidate (for longer names)
    for term in candidates:
        c = clean_text(term)
        if not c or len(c) < 5: continue
        for k, v in IMAGE_CATALOG.items():
            if len(k) >= 5 and k in c:
                return v
    return None

# ----------------------------------------------------
# RAG In-Memory Engine & Catalog Manager
# ----------------------------------------------------
class RAGEngine:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        self.docs = []
        self.catalog = {
            'monstros': [],
            'magias': [],
            'classes': [],
            'subclasses': [],
            'talentos': [],
            'racas': [],
            'regras': []
        }
        self.index_docs()

    def tokenize(self, text, remove_stop_words=False):
        tokens = re.findall(r'[a-zA-Z0-9\u00C0-\u00FF]+', text.lower())
        if remove_stop_words:
            return [t for t in tokens if t not in PORTUGUESE_STOP_WORDS and len(t) > 1]
        return tokens

    def index_docs(self):
        print(f"[RAG] Indexing documents from {self.data_dir}...", flush=True)
        self.docs = []
        self.catalog = {
            'monstros': [],
            'magias': [],
            'classes': [],
            'subclasses': [],
            'talentos': [],
            'racas': [],
            'regras': []
        }
        
        if not os.path.exists(self.data_dir):
            print(f"[RAG] Warning: Data dir {self.data_dir} does not exist yet!", flush=True)
            return

        for root, _, files in os.walk(self.data_dir):
            for f in sorted(files):
                if f.endswith('.md') and f != 'README.md':
                    fpath = os.path.join(root, f)
                    try:
                        with open(fpath, 'r', encoding='utf-8', errors='ignore') as fp:
                            content = fp.read()
                        
                        title = f.replace('.md', '').replace('_', ' ').title()
                        title_en = ''
                        category = 'Geral'
                        
                        m = re.search(r'---\s*\ntitle:\s*\"([^\"]+)\"', content)
                        if m: title = m.group(1)
                        m_en = re.search(r'title_en:\s*\"([^\"]+)\"', content)
                        if m_en: title_en = m_en.group(1)
                        m_cat = re.search(r'category:\s*\"([^\"]+)\"', content)
                        if m_cat: category = m_cat.group(1)

                        rel_path = os.path.relpath(fpath, self.data_dir)
                        body_clean = re.sub(r'---[\s\S]*?---', '', content)
                        
                        # Filtered meaningful tokens for search
                        meaningful_tokens = self.tokenize(body_clean, remove_stop_words=True)
                        title_tokens = set(self.tokenize(title, remove_stop_words=True) + self.tokenize(title_en, remove_stop_words=True))
                        
                        # Extra metadata extraction for catalogs
                        meta = {}
                        if '08_monstros' in rel_path or category == 'Monstros':
                            m_cr = re.search(r'Desafio\s+([0-9/]+)', content, re.IGNORECASE)
                            meta['cr'] = m_cr.group(1) if m_cr else '?'
                            
                            type_candidates = [
                                'Dragão', 'Demônio', 'Diabo', 'Morto-Vivo', 'Fera', 'Humanoide',
                                'Monstruosidade', 'Elemental', 'Aberração', 'Gigante', 'Fada',
                                'Constructo', 'Planta', 'Limo'
                            ]
                            detected_type = 'Monstro'
                            for tc in type_candidates:
                                if re.search(r'\b' + tc + r'\b', content, re.IGNORECASE):
                                    detected_type = tc
                                    break
                            meta['type'] = detected_type
                            
                            self.catalog['monstros'].append({
                                'title': title,
                                'title_en': title_en,
                                'cr': meta['cr'],
                                'type': detected_type,
                                'path': rel_path
                            })
                        elif '07_magias' in rel_path or category == 'Magias':
                            m_lvl = re.search(r'\*(Truque|[^\*]+Nível\s+[0-9]+|[^\*]+Circle|[^\*]+Cantrip)[^\*]*\*', content, re.IGNORECASE)
                            meta['level_info'] = m_lvl.group(1).strip() if m_lvl else 'Magia'
                            self.catalog['magias'].append({
                                'title': title,
                                'title_en': title_en,
                                'info': meta['level_info'],
                                'path': rel_path
                            })
                        elif '02_classes' in rel_path or category == 'Classes':
                            self.catalog['classes'].append({'title': title, 'title_en': title_en, 'path': rel_path})
                        elif '03_subclasses' in rel_path or category == 'Subclasses':
                            self.catalog['subclasses'].append({'title': title, 'title_en': title_en, 'path': rel_path})
                        elif '05_talentos' in rel_path or category == 'Talentos (Feats)':
                            self.catalog['talentos'].append({'title': title, 'title_en': title_en, 'path': rel_path})
                        elif '04_racas' in rel_path or category == 'Raças / Espécies':
                            self.catalog['racas'].append({'title': title, 'title_en': title_en, 'path': rel_path})
                        else:
                            self.catalog['regras'].append({'title': title, 'title_en': title_en, 'path': rel_path})

                        self.docs.append({
                            'id': rel_path,
                            'title': title,
                            'title_en': title_en,
                            'category': category,
                            'path': rel_path,
                            'content': content,
                            'snippet': body_clean[:350].strip() + '...',
                            'tokens': meaningful_tokens,
                            'title_tokens': title_tokens,
                            'meta': meta
                        })
                    except Exception:
                        pass

        print(f"[RAG] Successfully indexed {len(self.docs)} documents!", flush=True)
        print(f"[RAG] Catalog counts: Monstros={len(self.catalog['monstros'])}, Magias={len(self.catalog['magias'])}, Classes={len(self.catalog['classes'])}, Talentos={len(self.catalog['talentos'])}", flush=True)

    def search(self, query, top_k=8):
        query_clean = query.strip()
        q_lower = query_clean.lower()
        
        # 1. Detect Category / Catalog Aggregation Intent
        is_listing = any(kw in q_lower for kw in [
            'liste', 'listar', 'lista', 'quais', 'todos os', 'todas as', 'quantos', 'quantas',
            'catalogo', 'catálogo', 'grimorio', 'grimório', 'bestiario', 'bestiário',
            'tabela', 'resumo de monstros', 'quais monstros', 'quais criaturas', 'quais magias'
        ])
        
        is_monster_intent = any(kw in q_lower for kw in [
            'monstro', 'monstros', 'criatura', 'criaturas', 'inimigo', 'inimigos', 'bestiario', 'bestiário',
            'dragao', 'dragão', 'dragoes', 'dragões', 'dragon', 'dragons', 'morto-vivo', 'mortos-vivos',
            'undead', 'demonio', 'demônio', 'demonios', 'demônios', 'diabo', 'diabos', 'aberração', 'aberrações'
        ])
        is_spell_intent = any(kw in q_lower for kw in [
            'magia', 'magias', 'feitico', 'feitiço', 'feitiços', 'truque', 'truques', 'grimorio', 'grimório'
        ])
        is_class_intent = any(kw in q_lower for kw in ['classe', 'classes', 'subclasse', 'subclasses'])
        is_feat_intent = any(kw in q_lower for kw in ['talento', 'talentos', 'feats'])
        is_tool_intent = any(kw in q_lower for kw in ['ferramenta', 'ferramentas', 'tools', 'kit de', 'kits de', 'artesao', 'artesão'])
        is_weapon_intent = any(kw in q_lower for kw in ['arma', 'armas', 'weapons', 'espada', 'arco', 'machado'])
        is_armor_intent = any(kw in q_lower for kw in ['armadura', 'armaduras', 'escudo', 'escudos', 'armor'])

        # Tool / Equipment Listing Query
        if is_listing and is_tool_intent:
            print(f"[RAG] Detected TOOL CATALOG query: '{query}'", flush=True)
            tool_docs = [d for d in self.docs if 'tools.md' in d['path'] or 'crafting' in d['path'] or 'adventuring_gear.md' in d['path']]
            extra = self._standard_search(query, top_k=4)
            return tool_docs + [d for d in extra if d['path'] not in [t['path'] for t in tool_docs]]

        # Weapon Listing Query
        if is_listing and is_weapon_intent:
            print(f"[RAG] Detected WEAPON CATALOG query: '{query}'", flush=True)
            wpn_docs = [d for d in self.docs if 'weapons.md' in d['path']]
            extra = self._standard_search(query, top_k=4)
            return wpn_docs + [d for d in extra if d['path'] not in [w['path'] for w in wpn_docs]]

        # Monster Catalog Listing Query
        if is_listing and is_monster_intent:
            print(f"[RAG] Detected MONSTER CATALOG query: '{query}'", flush=True)
            filtered_monsters = self.catalog['monstros']
            filter_name = ""
            
            # Check specific subfilters
            if any(k in q_lower for k in ['dragao', 'dragão', 'dragoes', 'dragões', 'dragon']):
                filtered_monsters = [m for m in filtered_monsters if 'drag' in m['title'].lower() or 'drag' in m['title_en'].lower() or m['type'] == 'Dragão']
                filter_name = " (Dragões)"
            elif any(k in q_lower for k in ['morto-vivo', 'mortos-vivos', 'undead', 'zumbi', 'esqueleto']):
                filtered_monsters = [m for m in filtered_monsters if m['type'] == 'Morto-Vivo' or any(k in m['title'].lower() for k in ['zumbi', 'esqueleto', 'mumia', 'vampiro', 'fantasma'])]
                filter_name = " (Mortos-Vivos)"
            elif any(k in q_lower for k in ['demonio', 'demônio', 'demonios', 'demônios', 'diabo', 'infernal']):
                filtered_monsters = [m for m in filtered_monsters if m['type'] in ['Demônio', 'Diabo'] or any(k in m['title'].lower() for k in ['demônio', 'diabo', 'lêmure', 'lemure'])]
                filter_name = " (Demônios e Diabos)"

            def parse_cr_val(cr_str):
                c = cr_str.strip()
                if '/' in c:
                    p = c.split('/')
                    try: return float(p[0]) / float(p[1])
                    except: return 0.0
                try: return float(c)
                except: return 0.0

            tiers = [
                ("👑 Ameaças Cósmicas e Lendárias (ND 17 a 30)", lambda cr: cr >= 17),
                ("⚔️ Desafios Épicos e Chefes (ND 11 a 16)", lambda cr: 11 <= cr < 17),
                ("🛡️ Ameaças de Nível Intermediário (ND 5 a 10)", lambda cr: 5 <= cr < 11),
                ("🗡️ Desafios Heroicos Iniciais (ND 1 a 4)", lambda cr: 1 <= cr < 5),
                ("🐾 Criaturas Menores, Lacaios e Animais (ND 0 a 1/2)", lambda cr: cr < 1)
            ]

            lines = [
                f"# Catálogo Oficial Completo de Monstros do D&D 2024{filter_name}",
                f"Total de criaturas oficiais indexadas no acervo: **{len(filtered_monsters)} criaturas**.\n",
                "O catálogo abaixo agrupa todas as criaturas por faixas de Nível de Desafio (ND / CR) e tipos:\n"
            ]

            for tier_name, tier_filter in tiers:
                tier_items = [m for m in filtered_monsters if tier_filter(parse_cr_val(m['cr']))]
                if tier_items:
                    lines.append(f"\n### {tier_name} ({len(tier_items)} criaturas)\n")
                    lines.append("| Monstro (PT-BR) | Nome Original (EN) | ND | Tipo |")
                    lines.append("| :--- | :--- | :---: | :--- |")
                    for m in tier_items:
                        lines.append(f"| {m['title']} | {m['title_en']} | {m['cr']} | {m['type']} |")

            catalog_content = "\n".join(lines)
            
            catalog_doc = {
                'id': 'catalogo_monstros_completo',
                'title': f"Catálogo Completo de Monstros ({len(filtered_monsters)} criaturas)",
                'title_en': f"Official Monster Catalog ({len(filtered_monsters)} creatures)",
                'category': 'Monstros',
                'path': '08_monstros/README.md',
                'content': catalog_content,
                'snippet': f"Catálogo oficial com {len(filtered_monsters)} monstros indexados do livro de regras D&D 2024.",
                'tokens': [],
                'title_tokens': set(),
                'is_catalog': True
            }
            extra_docs = self._standard_search(query, top_k=4, filter_category='Monstros')
            return [catalog_doc] + [d for d in extra_docs if d['id'] != catalog_doc['id']]

        # Spell Catalog Listing Query
        if is_listing and is_spell_intent:
            print(f"[RAG] Detected SPELL CATALOG query: '{query}'", flush=True)
            filtered_spells = self.catalog['magias']
            lines = [
                "# Catálogo Oficial de Magias do D&D 2024",
                f"Total no acervo: {len(filtered_spells)} magias oficiais indexadas.\n",
                "| Magia (PT-BR) | Nome Original (EN) | Círculo / Tipo |",
                "| :--- | :--- | :--- |"
            ]
            for s in filtered_spells:
                lines.append(f"| {s['title']} | {s['title_en']} | {s['info']} |")
            
            catalog_content = "\n".join(lines)
            catalog_doc = {
                'id': 'catalogo_magias_completo',
                'title': f"Grimório Completo de Magias ({len(filtered_spells)} magias)",
                'title_en': f"Official Spellbook ({len(filtered_spells)} spells)",
                'category': 'Magias',
                'path': '07_magias/README.md',
                'content': catalog_content,
                'snippet': f"Grimório oficial com {len(filtered_spells)} magias indexadas do livro de regras D&D 2024.",
                'tokens': [],
                'title_tokens': set(),
                'is_catalog': True
            }
            extra_docs = self._standard_search(query, top_k=4, filter_category='Magias')
            return [catalog_doc] + [d for d in extra_docs if d['id'] != catalog_doc['id']]

        # Standard Targeted Search
        return self._standard_search(query, top_k=top_k)

    def _standard_search(self, query, top_k=8, filter_category=None):
        q_clean = query.strip()
        q_lower = q_clean.lower()
        q_tokens = self.tokenize(q_clean, remove_stop_words=True)
        
        # If all tokens were stop words (rare), fallback to raw tokens
        if not q_tokens:
            q_tokens = self.tokenize(q_clean, remove_stop_words=False)
        if not q_tokens:
            return []

        scores = []
        for d in self.docs:
            if filter_category and d['category'] != filter_category:
                continue

            score = 0.0
            title_lower = d['title'].lower()
            title_en_lower = d['title_en'].lower() if d['title_en'] else ''

            # 1. Exact title full match (Highest priority)
            if title_lower == q_lower or title_en_lower == q_lower:
                score += 160.0
            elif title_lower in q_lower or (title_en_lower and title_en_lower in q_lower):
                score += 85.0
            
            # 2. Meaningful title token matches
            for qt in q_tokens:
                if qt in d['title_tokens']:
                    score += 35.0
                if qt in d['path'].lower():
                    score += 10.0
            
            # 3. Category affinity boost
            if 'monstro' in q_lower and d['category'] == 'Monstros':
                score += 20.0
            if 'magia' in q_lower and d['category'] == 'Magias':
                score += 20.0
            if 'classe' in q_lower and d['category'] == 'Classes':
                score += 20.0
            if 'regra' in q_lower and d['category'] == 'Regras Básicas':
                score += 20.0

            # 4. Content TF matches
            token_count = len(d['tokens'])
            if token_count > 0:
                tf = sum(1 for t in d['tokens'] if t in q_tokens)
                score += (tf / (token_count ** 0.5)) * 3.0
            
            if score > 0:
                scores.append((score, d))
        
        scores.sort(key=lambda x: x[0], reverse=True)
        return [doc for _, doc in scores[:top_k]]

rag = RAGEngine(DATA_DIR)

# ----------------------------------------------------
# Gemini 3.5 Flash Caller
# ----------------------------------------------------
def call_gemini(messages, context_docs):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent?key={API_KEY}"
    
    # Build System context from retrieved RAG documents
    rag_context = ""
    if context_docs:
        rag_context = "\n\n=== REGRAS OFICIAIS DO D&D 2024 RECUPERADAS (RAG) ===\n"
        for i, doc in enumerate(context_docs, 1):
            rag_context += f"\n--- [FONTE {i}: {doc['title']} ({doc['path']})] ---\n"
            # Catalog documents are allowed generous token room (up to 35k chars) so no entries are lost
            char_cap = 35000 if doc.get('is_catalog') else 6500
            rag_context += doc['content'][:char_cap] + "\n"
    
    system_instruction = (
        "Você é o Oráculo de D&D 2024, um Mestre experiente e árbitro oficial das regras de D&D 5ª Edição (2024 Free Rules / SRD 5.2). "
        "Seu objetivo é sanar dúvidas de jogadores e Mestres com máxima fidelidade às regras oficiais.\n\n"
        "DIRETRIZES FUNDAMENTAIS:\n"
        "1. Responda SEMPRE em Português do Brasil com tom erudito, direto e imersivo. NUNCA pense em voz alta em inglês ou mencione processos internos/limitações de tokens.\n"
        "2. Use a terminologia padrão bilíngue sempre que citar mecânicas importantes (ex.: Pontos de Vida (PV / Hit Points), Classe de Armadura (CA / Armor Class), Nível de Desafio (ND / CR), Teste de Resistência (Saving Throw), Truque (Cantrip), Espaço de Magia (Spell Slot)).\n"
        "3. Embase sua resposta estritamente nas REGRAS E NO ACERVO OFICIAL fornecidos no contexto RAG.\n"
        "4. REGRA OBRIGATÓRIA PARA LISTAGENS DE QUALQUER ITEM, TIPO, PERSONAGEM, MAGIA, FERRAMENTA OU REGRA:\n"
        "   - Sempre que o usuário solicitar uma lista de QUALQUER coisa (itens, ferramentas, magias, monstros, personagens, classes, tipos de dano, armas, condições, regras, etc.), você DEVE OBRIGATORIAMENTE formatar os itens como uma TABELA MARKDOWN rica e estruturada.\n"
        "   - A primeira coluna DEVE ser o Nome do Item (PT-BR) e a segunda Nome Original (EN) se houver.\n"
        "   - As colunas seguintes devem conter propriedades essenciais (ex: Tipo/Categoria, Custo, ND/Círculo, Peso, Propriedades, Resumo do Efeito/Uso).\n"
        "   - Exemplo obrigatório de tabela:\n"
        "     | Nome (PT-BR) | Nome Original (EN) | Tipo / Categoria | Custo / ND / Círculo | Resumo / Efeito Principal |\n"
        "     | :--- | :--- | :--- | :--- | :--- |\n"
        "   - NUNCA use apenas listas com marcadores simples quando o usuário pedir listas, pois o chat transforma tabelas em um componente interativo dinâmico com busca em tempo real e abertura de ficha ao clicar no item!\n"
        "5. Formate as respostas com tabelas elegantes, marcadores e negritos em Markdown."
    )

    contents = []
    
    # Inject RAG context into conversation
    for i, msg in enumerate(messages):
        role = "user" if msg["role"] == "user" else "model"
        text = msg["content"]
        if i == len(messages) - 1 and role == "user":
            text = f"{rag_context}\n\n=== PERGUNTA DO JOGADOR / MESTRE ===\n{text}"
        contents.append({
            "role": role,
            "parts": [{"text": text}]
        })

    payload = {
        "system_instruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.3,
            "topP": 0.95,
            "maxOutputTokens": 8192
        }
    }

    req_data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={'Content-Type': 'application/json'}
    )
    
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=40) as resp:
        res_json = json.loads(resp.read().decode('utf-8'))
        try:
            return res_json['candidates'][0]['content']['parts'][0]['text']
        except Exception:
            return "Desculpe, não consegui formular uma resposta baseada nas regras."

# ----------------------------------------------------
# Dice Roller Evaluator
# ----------------------------------------------------
def roll_dice(expr):
    expr_clean = expr.lower().replace(" ", "")
    match = re.match(r'^(\d*)d(\d+)([+-]\d+)?$', expr_clean)
    if not match:
        return None
    num_dice = int(match.group(1)) if match.group(1) else 1
    dice_sides = int(match.group(2))
    modifier = int(match.group(3)) if match.group(3) else 0
    
    if num_dice > 50 or dice_sides > 1000:
        return None
    
    rolls = [random.randint(1, dice_sides) for _ in range(num_dice)]
    total = sum(rolls) + modifier
    return {
        "expression": expr,
        "rolls": rolls,
        "modifier": modifier,
        "total": total
    }

# ----------------------------------------------------
# HTTP Request Handler
# ----------------------------------------------------
class DndChatHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def do_POST(self):
        if self.path == '/api/chat':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                body = json.loads(post_data.decode('utf-8'))
                query = body.get('message', '').strip()
                history = body.get('history', [])
                
                # Check for dice roll command in message
                if query.startswith('/roll ') or query.startswith('/dado '):
                    dice_expr = query.split(' ', 1)[1]
                    roll_res = roll_dice(dice_expr)
                    if roll_res:
                        reply = f"🎲 **Rolagem de Dados:** `{roll_res['expression']}`\n\n- **Resultados:** {roll_res['rolls']}\n- **Modificador:** {roll_res['modifier']}\n\n### 🏆 Total: **{roll_res['total']}**"
                        self._send_json({
                            "reply": reply,
                            "sources": [],
                            "dice": roll_res
                        })
                        return

                # RAG Search with intent intelligence
                retrieved_docs = rag.search(query, top_k=8)
                
                # Call Gemini 3.5 Flash
                messages = history + [{"role": "user", "content": query}]
                ai_reply = call_gemini(messages, retrieved_docs)
                
                sources = [{
                    "id": d["id"],
                    "title": d["title"],
                    "title_en": d.get("title_en", ""),
                    "category": d["category"],
                    "path": d["path"],
                    "snippet": d["snippet"]
                } for d in retrieved_docs]

                self._send_json({
                    "reply": ai_reply,
                    "sources": sources
                })
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
            return

        elif self.path == '/api/reindex':
            rag.index_docs()
            self._send_json({"status": "ok", "total_docs": len(rag.docs)})
            return

        self._send_json({"error": "Endpoint não encontrado"}, status=404)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/stats':
            self._send_json({
                "model": MODEL_NAME,
                "total_docs": len(rag.docs),
                "data_dir": rag.data_dir,
                "catalogs": {k: len(v) for k, v in rag.catalog.items()}
            })
            return

        elif parsed.path == '/api/catalog':
            qs = urllib.parse.parse_qs(parsed.query)
            cat_type = qs.get('type', ['all'])[0].lower()
            if cat_type in ['monsters', 'monstros']:
                self._send_json({"total": len(rag.catalog['monstros']), "items": rag.catalog['monstros']})
            elif cat_type in ['spells', 'magias']:
                self._send_json({"total": len(rag.catalog['magias']), "items": rag.catalog['magias']})
            elif cat_type in ['classes']:
                self._send_json({"total": len(rag.catalog['classes']), "items": rag.catalog['classes']})
            elif cat_type in ['talentos', 'feats']:
                self._send_json({"total": len(rag.catalog['talentos']), "items": rag.catalog['talentos']})
            else:
                summary = {k: len(v) for k, v in rag.catalog.items()}
                summary['total_docs'] = len(rag.docs)
                self._send_json(summary)
            return

        elif parsed.path == '/api/document':
            qs = urllib.parse.parse_qs(parsed.query)
            doc_path = qs.get('path', [''])[0]
            full_path = os.path.abspath(os.path.join(DATA_DIR, doc_path))
            
            # Security check
            if full_path.startswith(DATA_DIR) and os.path.exists(full_path):
                with open(full_path, 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()
                self._send_json({"path": doc_path, "content": content})
            else:
                self._send_json({"error": "Documento não encontrado"}, status=404)
            return

        elif parsed.path == '/api/item_detail':
            qs = urllib.parse.parse_qs(parsed.query)
            query = qs.get('query', [''])[0].strip()
            path = qs.get('path', [''])[0].strip()

            if path:
                full_path = os.path.abspath(os.path.join(DATA_DIR, path))
                if full_path.startswith(DATA_DIR) and os.path.exists(full_path):
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as fp:
                        content = fp.read()
                    title = os.path.basename(path).replace('.md', '').replace('_', ' ').title()
                    m_en = re.search(r'title_en:\s*\"([^\"]+)\"', content)
                    title_en = m_en.group(1) if m_en else ''
                    m_t = re.search(r'title:\s*\"([^\"]+)\"', content)
                    if m_t: title = m_t.group(1)
                    slug = os.path.basename(path).replace('.md', '')
                    img_url = get_item_image(title, title_en, slug)
                    self._send_json({
                        "found": True,
                        "title": title,
                        "title_en": title_en,
                        "category": path.split('/')[0] if '/' in path else 'Geral',
                        "path": path,
                        "content": content,
                        "image_url": img_url
                    })
                    return

            if query:
                q_clean = clean_text(query)
                best_doc = None
                best_score = 0

                for d in rag.docs:
                    t_pt = clean_text(d['title'])
                    t_en = clean_text(d.get('title_en', ''))
                    pt_main = clean_text(d['title'].split('(')[0])
                    f_name = clean_text(os.path.basename(d['path']).replace('.md', ''))

                    # 1. Exact match on main name, english name or filename
                    if q_clean and (q_clean == pt_main or q_clean == t_en or q_clean == f_name):
                        best_doc = d
                        best_score = 300
                        break
                    elif q_clean and q_clean == t_pt:
                        best_doc = d
                        best_score = 250
                        break

                    # 2. Prefix or substring matching
                    score = 0
                    if pt_main.startswith(q_clean) or (t_en and t_en.startswith(q_clean)):
                        score = 180 - abs(len(q_clean) - len(pt_main))
                    elif q_clean in pt_main or (t_en and q_clean in t_en):
                        score = 140 - abs(len(q_clean) - len(pt_main))
                    elif pt_main in q_clean:
                        score = 110 - abs(len(q_clean) - len(pt_main))

                    if score > best_score:
                        best_score = score
                        best_doc = d

                if best_doc and best_score >= 100:
                    slug = os.path.basename(best_doc['path']).replace('.md', '')
                    img_url = get_item_image(best_doc['title'], best_doc.get('title_en'), slug)
                    self._send_json({
                        "found": True,
                        "title": best_doc['title'],
                        "title_en": best_doc.get('title_en', ''),
                        "category": best_doc['category'],
                        "path": best_doc['path'],
                        "content": best_doc['content'],
                        "image_url": img_url
                    })
                    return

                # Check composite files
                target_files = [
                    '01_regras_basicas/tools.md',
                    '01_regras_basicas/weapons.md',
                    '01_regras_basicas/armor.md',
                    '01_regras_basicas/adventuring_gear.md',
                    '01_regras_basicas/crafting_nonmagical_items.md',
                    '01_regras_basicas/magic_items.md',
                    '06_glossario_de_regras/conditions.md',
                    '01_regras_basicas/damage_and_healing.md'
                ]
                for rel_f in target_files:
                    fpath = os.path.join(DATA_DIR, rel_f)
                    if os.path.exists(fpath):
                        with open(fpath, 'r', encoding='utf-8', errors='ignore') as fp:
                            ftext = fp.read()
                        if re.search(r'\b' + re.escape(query) + r'\b', ftext, re.IGNORECASE):
                            section_match = re.search(
                                r'(###?\s+[^\n]*' + re.escape(query) + r'[^\n]*\n[\s\S]*?)(?=\n###?|\Z)',
                                ftext,
                                re.IGNORECASE
                            )
                            section_content = section_match.group(1).strip() if section_match else ftext[:4000]
                            img_url = get_item_image(query)
                            self._send_json({
                                "found": True,
                                "title": query,
                                "category": rel_f.split('/')[0].replace('_', ' ').title(),
                                "path": rel_f,
                                "content": section_content,
                                "image_url": img_url
                            })
                            return

                img_url = get_item_image(query)
                self._send_json({"found": False, "title": query, "image_url": img_url})
                return

        elif parsed.path == '/api/image_catalog':
            self._send_json(IMAGE_CATALOG)
            return

        elif parsed.path == '/api/item_image':
            qs = urllib.parse.parse_qs(parsed.query)
            query = qs.get('query', [''])[0].strip()
            self._send_json({"query": query, "image_url": get_item_image(query)})
            return

        return super().do_GET()

    def _send_json(self, data, status=200):
        out = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(out)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(out)

def run():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, DndChatHandler)
    print(f"\n=======================================================", flush=True)
    print(f"🧙 D&D 2024 RAG Chat Server rodando com {MODEL_NAME}!", flush=True)
    print(f"👉 Acesse localmente em: http://localhost:{PORT}", flush=True)
    print(f"=======================================================\n", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()

if __name__ == '__main__':
    run()
