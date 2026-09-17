// Fonction Vercel : sert la page d'un article avec les bonnes balises Open Graph
// (image, titre, description) déjà présentes dans le HTML, pour que Facebook,
// Instagram, LinkedIn, etc. affichent le bon aperçu au lieu du logo par défaut.
//
// Elle est branchée sur /article.html via vercel.json. Le gabarit visuel reste
// dans article-page.html (le fichier renommé) : on le lit, on injecte les balises
// dans le <head>, et on renvoie le tout. Les visiteurs humains voient la page
// identique ; les robots des réseaux sociaux voient enfin la vraie image.

const SITE_FALLBACK = 'https://montrealracingteam.ca';

module.exports = async (req, res) => {
  const id = (req.query && req.query.id) ? String(req.query.id) : '';

  // Origine réelle du déploiement (marche en prod comme en préproduction Vercel)
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = host ? `${proto}://${host}` : SITE_FALLBACK;

  // 1) Charger le gabarit visuel + la liste des articles, en parallèle
  let template = '';
  let article = null;
  try {
    const [tplRes, listRes] = await Promise.all([
      fetch(`${origin}/article-page.html`),
      fetch(`${origin}/articles.json`, { cache: 'no-store' })
    ]);
    if (tplRes.ok) template = await tplRes.text();
    if (listRes.ok) {
      const list = await listRes.json();
      if (Array.isArray(list)) article = list.find(a => a.id === id) || null;
    }
  } catch (e) { /* on gère juste après */ }

  // Filet de sécurité : si le gabarit est introuvable, on renvoie vers les actualités
  if (!template) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.status(200).send('<!doctype html><meta http-equiv="refresh" content="0;url=/actualites.html">');
    return;
  }

  // 2) Construire les valeurs des balises
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const title = article ? `${article.title} — Montreal Racing Team`
                        : 'Actualité — Montreal Racing Team';
  const desc  = article ? (article.summary || '') : '';
  const pageUrl = `${origin}/article.html?id=${encodeURIComponent(id)}`;

  // Image : rendue ABSOLUE (obligatoire pour Facebook). À défaut, image sociale par défaut.
  let img = (article && article.image) ? article.image : '/mrt-og-default.jpg';
  if (!/^https?:\/\//i.test(img)) img = origin + (img.charAt(0) === '/' ? '' : '/') + img;

  const og = `
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Montreal Racing Team">
  <meta property="og:locale" content="fr_CA">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(pageUrl)}">
  <meta property="og:image" content="${esc(img)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(img)}">`;

  // 3) Injecter : retirer le <title> du gabarit puis insérer nos balises après <head>
  let html = template.replace(/<title>[\s\S]*?<\/title>/i, '');
  html = html.replace(/<head>/i, '<head>' + og);

  res.setHeader('content-type', 'text/html; charset=utf-8');
  // Cache CDN court + revalidation : les crawlers voient vite les mises à jour
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
