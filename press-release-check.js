// ═══════════════════════════════════════════════════════════════════════════
// COMMUNIQUÉS DE PRESSE AUTOMATIQUES — version gratuite (GitHub Actions)
//
// Contrairement à un bot qui reste connecté 24/7 (payant à héberger), ce
// script se contente de vérifier, de temps en temps (toutes les ~10-15 min,
// voir .github/workflows/press-releases.yml), s'il y a de nouveaux messages
// dans le salon Discord #communiqué-de-presse. S'il y en a, il les reformule
// en article via l'API Claude et les ajoute à articles-live.json, que le
// site charge automatiquement (voir index.html).
//
// Secrets requis (GitHub → Settings → Secrets and variables → Actions) :
//   DISCORD_TOKEN      — le token du bot (le même que sur Railway)
//   PRESS_CHANNEL_ID   — l'ID du salon #communiqué-de-presse
//   ANTHROPIC_API_KEY  — clé API Claude
//
// Aucun jeton GitHub séparé n'est nécessaire ici : GitHub Actions fournit son
// propre accès en écriture au dépôt (voir "permissions: contents: write"
// dans le fichier de workflow).
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const PRESS_CHANNEL_ID = process.env.PRESS_CHANNEL_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ARTICLE_MODEL = process.env.ARTICLE_MODEL || 'claude-sonnet-5';

const ARTICLES_FILE = 'articles-live.json';
const STATE_FILE = '.press-bot-state.json';
const MAX_LIVE_ARTICLES = 30;

function readJson(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return fallback; }
}
function writeJson(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

// Récupère les messages postés après le dernier traité (ordre chronologique).
async function fetchNewMessages(afterId) {
  const url = new URL(`https://discord.com/api/v10/channels/${PRESS_CHANNEL_ID}/messages`);
  url.searchParams.set('limit', '20');
  if (afterId) url.searchParams.set('after', afterId);
  const res = await fetch(url, { headers: { authorization: `Bot ${DISCORD_TOKEN}` } });
  if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);
  const messages = await res.json();
  // Discord renvoie du plus récent au plus ancien : on remet en ordre chronologique
  return messages.slice().reverse();
}

// Demande à Claude de transformer le message brut en article structuré.
async function generateArticleFromMessage(rawText) {
  const prompt = `Tu es le journaliste sportif officiel de l'écurie Esport sim racing Montreal Racing Team (MRT), qui court sur Le Mans Ultimate en Hypercar, LMP2, LMP3 et LMGT3.

On te donne ci-dessous un message brut posté par l'équipe dans le salon Discord "communiqué de presse" (résultat de course, annonce, partenariat, recrutement, programme de la semaine, etc.). Réécris-le en article de site web, en français, dans un style journalistique sportif professionnel (comme un communiqué WEC/FIA), clair et engageant, sans inventer de faits qui ne sont pas dans le message.

Message brut :
"""
${rawText}
"""

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises markdown, au format exact suivant :
{
  "meta": "ÉTIQUETTE COURTE EN MAJUSCULES (ex: RÉSULTAT, ANNONCE, PARTENARIAT, RECRUTEMENT, ÉVÉNEMENT)",
  "title": "Titre accrocheur de l'article",
  "date": "Sous-titre court (ex: Communiqué de presse · résultat de course)",
  "content": "Deux à quatre paragraphes HTML, chacun entouré de balises <p>...</p>, qui développent le message brut en article complet."
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ARTICLE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let text = (data.content && data.content[0] && data.content[0].text) || '';
  text = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(text);
  if (!parsed.title || !parsed.content) throw new Error('Réponse IA incomplète (title/content manquant)');
  return parsed;
}

async function main() {
  if (!DISCORD_TOKEN || !PRESS_CHANNEL_ID || !ANTHROPIC_API_KEY) {
    console.log('⏭️  Variables manquantes (DISCORD_TOKEN/PRESS_CHANNEL_ID/ANTHROPIC_API_KEY) — on ignore ce passage.');
    return;
  }

  const state = readJson(STATE_FILE, { lastMessageId: null });
  const messages = await fetchNewMessages(state.lastMessageId);

  if (messages.length === 0) {
    console.log('Aucun nouveau message dans #communiqué-de-presse.');
    return;
  }

  const articles = readJson(ARTICLES_FILE, []);
  const existingIds = new Set(articles.map(a => a.id));
  let changed = false;

  for (const msg of messages) {
    state.lastMessageId = msg.id; // on avance toujours, même en cas d'erreur, pour ne pas boucler indéfiniment sur un message qui échoue

    if (msg.author && msg.author.bot) continue;
    const articleId = `live-${msg.id}`;
    if (existingIds.has(articleId)) continue; // sécurité anti-doublon

    const rawText = (msg.content || '').trim();
    const imgUrl = ((msg.attachments || []).find(a => (a.content_type || '').startsWith('image/')) || {}).url || null;
    if (rawText.length < 8 && !imgUrl) continue; // trop court pour être un vrai communiqué

    try {
      const generated = await generateArticleFromMessage(rawText || 'Communiqué de presse (voir image jointe).');
      articles.unshift({
        id: articleId,
        meta: generated.meta || 'COMMUNIQUÉ',
        title: generated.title,
        date: generated.date || 'Communiqué de presse — Montreal Racing Team',
        content: generated.content,
        imgUrl,
        createdAt: new Date(msg.timestamp || Date.now()).toISOString(),
      });
      changed = true;
      console.log('✅ Article généré pour le message', msg.id, '→', generated.title);
    } catch (err) {
      console.error('❌ Erreur pour le message', msg.id, ':', err.message);
    }
  }

  if (changed) {
    writeJson(ARTICLES_FILE, articles.slice(0, MAX_LIVE_ARTICLES));
  }
  writeJson(STATE_FILE, state);
}

main().catch(err => { console.error('❌ Erreur fatale:', err); process.exit(1); });
