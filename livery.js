// Fonction Vercel : sert la fiche d'une livrée avec les bonnes balises Open Graph
// (photo de la voiture, modèle) déjà dans le HTML, pour que Facebook/X affichent
// le bon aperçu quand on partage une livrée précise.
//
// Branchée sur /livery.html via vercel.json. Le gabarit visuel reste dans
// livery-page.html (le fichier renommé) : on le lit, on injecte les balises
// dans le <head>, on renvoie le tout. Les visiteurs voient la page identique.

const SITE_FALLBACK = 'https://montrealracingteam.ca';
const CATS = { hypercar: 'Hypercar', lmp2: 'LMP2', lmp3: 'LMP3', lmgt3: 'LMGT3' };

module.exports = async (req, res) => {
  const id = (req.query && req.query.id) ? String(req.query.id) : '';

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = host ? `${proto}://${host}` : SITE_FALLBACK;

  let template = '';
  let car = null;
  try {
    const [tplRes, listRes] = await Promise.all([
      fetch(`${origin}/livery-page.html`),
      fetch(`${origin}/liveries.json`, { cache: 'no-store' })
    ]);
    if (tplRes.ok) template = await tplRes.text();
    if (listRes.ok) {
      const list = await listRes.json();
      if (Array.isArray(list)) car = list.find(c => c.id === id) || null;
    }
  } catch (e) { /* géré juste après */ }

  if (!template) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.status(200).send('<!doctype html><meta http-equiv="refresh" content="0;url=/liveries.html">');
    return;
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const catLabel = car ? (CATS[car.category] || car.category || '') : '';
  const title = car ? `${car.model} — Montreal Racing Team`
                    : 'Liveries — Montreal Racing Team';
  const desc  = car
    ? `Livrée ${car.model}${catLabel ? ' — ' + catLabel : ''}, créée par ${car.artist || 'SDL'}. Écurie MRT #514 sur Le Mans Ultimate.`
    : "Les livrées de l'écurie MRT #514 sur Le Mans Ultimate.";
  const pageUrl = `${origin}/livery.html?id=${encodeURIComponent(id)}`;

  // Image : la couverture de la voiture, rendue absolue. À défaut, image sociale par défaut.
  let img = (car && car.cover) ? car.cover : '/og-image.jpg';
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

  let html = template.replace(/<title>[\s\S]*?<\/title>/i, '');
  html = html.replace(/<head>/i, '<head>' + og);

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
