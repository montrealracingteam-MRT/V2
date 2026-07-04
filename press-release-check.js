name: Communiqués de presse (Discord -> site)

# Vérifie toutes les 10 minutes s'il y a un nouveau message dans le salon
# Discord #communiqué-de-presse, le reformule en article (IA) et le publie
# sur le site (articles-live.json). Gratuit : tourne sur GitHub Actions,
# pas besoin d'hébergement payant type Railway.
#
# Tout le nécessaire est dans CE SEUL FICHIER (le script JS est généré à la
# volée dans l'étape ci-dessous) : il n'y a rien d'autre à créer ou modifier.
#
# Secrets requis (Settings -> Secrets and variables -> Actions) :
#   DISCORD_TOKEN, PRESS_CHANNEL_ID, ANTHROPIC_API_KEY

on:
  schedule:
    - cron: '*/10 * * * *'
  workflow_dispatch: {} # permet de le lancer manuellement pour tester

permissions:
  contents: write

jobs:
  check-press-releases:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Vérifie les nouveaux communiqués
        env:
          DISCORD_TOKEN: ${{ secrets.DISCORD_TOKEN }}
          PRESS_CHANNEL_ID: ${{ secrets.PRESS_CHANNEL_ID }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          cat > /tmp/press-release-check.js << 'EOF_SCRIPT'
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

          async function fetchNewMessages(afterId) {
            const url = new URL(`https://discord.com/api/v10/channels/${PRESS_CHANNEL_ID}/messages`);
            url.searchParams.set('limit', '20');
            if (afterId) url.searchParams.set('after', afterId);
            const res = await fetch(url, { headers: { authorization: `Bot ${DISCORD_TOKEN}` } });
            if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);
            const messages = await res.json();
            return messages.slice().reverse();
          }

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
              console.log('Variables manquantes - on ignore ce passage.');
              return;
            }

            const state = readJson(STATE_FILE, { lastMessageId: null });
            const messages = await fetchNewMessages(state.lastMessageId);

            if (messages.length === 0) {
              console.log('Aucun nouveau message dans #communique-de-presse.');
              writeJson(STATE_FILE, state);
              return;
            }

            const articles = readJson(ARTICLES_FILE, []);
            const existingIds = new Set(articles.map(a => a.id));
            let changed = false;

            for (const msg of messages) {
              state.lastMessageId = msg.id;

              if (msg.author && msg.author.bot) continue;
              const articleId = `live-${msg.id}`;
              if (existingIds.has(articleId)) continue;

              const rawText = (msg.content || '').trim();
              const imgUrl = ((msg.attachments || []).find(a => (a.content_type || '').startsWith('image/')) || {}).url || null;
              if (rawText.length < 8 && !imgUrl) continue;

              try {
                const generated = await generateArticleFromMessage(rawText || 'Communique de presse (voir image jointe).');
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
                console.log('Article genere pour le message', msg.id, '->', generated.title);
              } catch (err) {
                console.error('Erreur pour le message', msg.id, ':', err.message);
              }
            }

            if (changed) {
              writeJson(ARTICLES_FILE, articles.slice(0, MAX_LIVE_ARTICLES));
            }
            writeJson(STATE_FILE, state);
          }

          main().catch(err => { console.error('Erreur fatale:', err); process.exit(1); });
          EOF_SCRIPT
          node /tmp/press-release-check.js

      - name: Publie les changements sur le site
        run: |
          git config user.name "MRT Press Bot"
          git config user.email "actions@github.com"
          [ -f articles-live.json ] && git add articles-live.json
          [ -f .press-bot-state.json ] && git add .press-bot-state.json
          git diff --staged --quiet || git commit -m "Communiqué de presse automatique"
          git push
