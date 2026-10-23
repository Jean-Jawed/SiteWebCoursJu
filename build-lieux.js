// =====================
// build-lieux.js — Écrit les lieux « en dur » dans les pages, depuis Firestore
//   1. lieux.html et en/places.html : cartes de la liste, compteur, JSON-LD,
//      liste des lieux qui ont une fiche
//   2. une fiche par lieu : lieux/<slug>.html et en/places/<slug>.html
//   3. sitemap.xml : ajout des fiches (après scripts/build-i18n.py, qui le régénère)
// Usage : npm run build (ou npm run i18n, qui le lance en dernier)
// =====================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    FAMILLES, TEXTES, cardHTML, familleDuLieu, nomFamille, nomCategorie, nomTag, icone, aUneIcone,
    photosDuLieu, publicUrlFromPath, urlFiche, urlItineraire, urlInstagram, adresseCourte, prixTexte,
    descriptionDuLieu, descriptionLongue, escapeHtml, triParNom, distance
} from './lieux-commun.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = 'https://cours-julien.fr';
const DOSSIERS_FICHES = { fr: 'lieux', en: path.join('en', 'places') };
const PAGES_LISTE = { fr: 'lieux.html', en: path.join('en', 'places.html') };
const URL_LISTE = { fr: '/lieux.html', en: '/en/places.html' };

// =====================
// Lecture de Firestore (API REST publique)
// =====================
function parseFirestoreValue(value) {
    if (!value) return null;
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue, 10);
    if (value.doubleValue !== undefined) return parseFloat(value.doubleValue);
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.timestampValue !== undefined) return value.timestampValue;
    if (value.arrayValue !== undefined) {
        return (value.arrayValue.values || []).map(parseFirestoreValue);
    }
    if (value.mapValue !== undefined) {
        const obj = {};
        for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
            obj[k] = parseFirestoreValue(v);
        }
        return obj;
    }
    if (value.nullValue !== undefined) return null;
    return value;
}

function parseFirestoreDocument(doc) {
    const id = doc.name.split('/').pop();
    const data = {};
    for (const [key, value] of Object.entries(doc.fields || {})) {
        data[key] = parseFirestoreValue(value);
    }
    return { id, ...data };
}

async function fetchCollection(collectionName) {
    const documents = [];
    let pageToken = '';
    do {
        const url = `https://firestore.googleapis.com/v1/projects/cours-julien/databases/(default)/documents/${collectionName}?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${collectionName}: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (data.documents) {
            documents.push(...data.documents.map(parseFirestoreDocument));
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return documents;
}

const parId = (docs) => Object.fromEntries(docs.map(d => [d.id, d]));

// =====================
// Programme
// =====================
async function buildLieux() {
    console.log('Fetching data from Firestore...');
    const [lieuxRaw, categoriesRaw, tagsRaw] = await Promise.all(
        ['lieux', 'categories', 'tags'].map(fetchCollection));
    const categories = parId(categoriesRaw);
    const tags = parId(tagsRaw);

    // Les lieux non publiés (brouillons) ne sont pas mis dans les pages
    const lieux = lieuxRaw.filter(l => l.publie !== false).sort(triParNom);
    const avecFiche = lieux.filter(l => l.slug);
    console.log(`Fetched ${lieux.length} lieux, ${categoriesRaw.length} categories, ${tagsRaw.length} tags.`);

    for (const lang of ['fr', 'en']) {
        const pageListe = path.join(__dirname, PAGES_LISTE[lang]);
        if (!fs.existsSync(pageListe)) {
            console.warn(`${PAGES_LISTE[lang]} absent : lancer d'abord « python scripts/build-i18n.py ».`);
            continue;
        }
        const ctx = { lang, categories, tags, aUneFiche: l => !!l.slug };
        injecterListe(pageListe, lieux, avecFiche, ctx);
        console.log(`Successfully updated ${PAGES_LISTE[lang]} with pre-rendered content and JSON-LD.`);

        const gabarit = fs.readFileSync(pageListe, 'utf8');
        const n = ecrireFiches(avecFiche, lieux, ctx, gabarit);
        console.log(`  ${n} fiches → ${DOSSIERS_FICHES[lang].replace(/\\/g, '/')}/`);
    }

    ajouterAuSitemap(avecFiche);
}

// =====================
// 1. Page liste
// =====================
function injecterListe(htmlPath, lieux, avecFiche, ctx) {
    const { lang } = ctx;
    const cardsHtml = lieux.map(l => cardHTML(l, ctx)).join('');

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "inLanguage": lang === 'en' ? 'en-GB' : 'fr-FR',
        "itemListElement": lieux.map((lieu, index) => ({
            "@type": "ListItem",
            "position": index + 1,
            "item": lieuJsonLd(lieu, ctx)
        }))
    };
    const jsonLdScript = `\n    <!-- JSON-LD SEO injecté au build -->\n    <script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n    </script>\n`;

    let html = fs.readFileSync(htmlPath, 'utf8');

    // JSON-LD avant </head> (le commentaire doit être immédiatement suivi de son script)
    html = html.replace(/\s*<!-- JSON-LD SEO injecté au build -->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/, '\n');
    html = html.replace(/\s*<!-- JSON-LD SEO injecté au build -->(?!\s*<script)/g, '');
    html = html.replace('</head>', `${jsonLdScript}</head>`);

    html = html.replace(
        /(<p id="listCount" class="list-count">)[^<]*(<\/p>)/,
        `$1${lang === 'en' ? `${lieux.length} places` : `${lieux.length} lieux`}$2`
    );
    html = html.replace(
        /(<div id="cardsGrid" class="cards-grid">)[\s\S]*?(<\/div><!-- \/cardsGrid -->)/,
        `$1${cardsHtml}\n      $2`
    );
    html = html.replace(
        /(<script type="application\/json" id="lieuxFiches">)[\s\S]*?(<\/script>)/,
        `$1${JSON.stringify(avecFiche.map(l => l.slug))}$2`
    );

    fs.writeFileSync(htmlPath, html, 'utf8');
}

// Données structurées d'un lieu (liste et fiche)
function lieuJsonLd(lieu, { lang }) {
    const desc = descriptionDuLieu(lieu, lang).texte;
    const images = photosDuLieu(lieu).map(p => publicUrlFromPath(p.image));
    const instagram = lieu.instagram ? urlInstagram(lieu.instagram) : undefined;
    const item = {
        "@type": "LocalBusiness",
        "name": lieu.nom,
        "url": lieu.slug ? SITE + urlFiche(lieu.slug, lang) : (lieu.site || instagram)
    };
    const sameAs = [lieu.site, instagram].filter(Boolean);
    if (sameAs.length) item.sameAs = sameAs;
    if (desc) item.description = desc;
    if (images.length) item.image = images.length > 1 ? images : images[0];
    if (lieu.adresse) item.address = lieu.adresse;
    if (lieu.telephone) item.telephone = lieu.telephone;
    if (prixTexte(lieu.prix)) item.priceRange = prixTexte(lieu.prix);
    if (lieu.latitude && lieu.longitude) {
        item.geo = { "@type": "GeoCoordinates", "latitude": lieu.latitude, "longitude": lieu.longitude };
    }
    return item;
}

// =====================
// 2. Fiches
// =====================
function ecrireFiches(avecFiche, tous, ctx, gabaritListe) {
    const dossier = path.join(__dirname, DOSSIERS_FICHES[ctx.lang]);
    fs.mkdirSync(dossier, { recursive: true });

    // Morceaux communs repris de la page liste (même nav, même pied de page)
    const nav = absolu(gabaritListe.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)[0]);
    const footer = absolu(gabaritListe.match(/<footer class="main-footer">[\s\S]*?<\/footer>/)[0]);

    const attendus = new Set();
    for (const lieu of avecFiche) {
        const fichier = `${lieu.slug}.html`;
        attendus.add(fichier);
        fs.writeFileSync(path.join(dossier, fichier), ficheHTML(lieu, tous, ctx, nav, footer), 'utf8');
    }
    // Fiches de lieux supprimés, dépubliés ou renommés
    for (const f of fs.readdirSync(dossier)) {
        if (f.endsWith('.html') && !attendus.has(f)) fs.unlinkSync(path.join(dossier, f));
    }
    return attendus.size;
}

// Les liens relatifs de la page liste (à la racine) deviennent absolus pour les sous-dossiers
function absolu(html) {
    return html.replace(/\s(href|src)="(?!https?:|\/|#|mailto:|tel:|data:)([^"]+)"/g, ' $1="/$2"');
}

function ficheHTML(lieu, tous, ctx, nav, footer) {
    const { lang, categories, tags } = ctx;
    const T = TEXTES[lang];
    const autre = lang === 'fr' ? 'en' : 'fr';
    const famille = familleDuLieu(lieu, categories);
    const couleur = FAMILLES[famille].couleur;
    const cats = (lieu.categories || []).filter(c => categories[c]);
    const nomCat = nomCategorie(categories[cats[0]], lang) || nomFamille(famille, lang);
    const photos = photosDuLieu(lieu);
    const courte = descriptionDuLieu(lieu, lang);
    const longue = descriptionLongue(lieu, lang);
    const url = SITE + urlFiche(lieu.slug, lang);
    const urlAutre = SITE + urlFiche(lieu.slug, autre);
    const urlFr = SITE + urlFiche(lieu.slug, 'fr');
    const image = photos[0] ? publicUrlFromPath(photos[0].image) : `${SITE}/images/web/partage.jpg`;
    const lieuDit = lang === 'en' ? 'Cours Julien, Marseille' : 'Cours Julien, Marseille';

    const titre = `${lieu.nom} — ${nomCat}, ${lieuDit}`;
    const metaDesc = [courte.texte, adresseCourte(lieu.adresse)].filter(Boolean).join(' · ') ||
        (lang === 'en' ? `${lieu.nom}, in the Cours Julien neighbourhood of Marseille.` : `${lieu.nom}, dans le quartier du Cours Julien à Marseille.`);

    // Sélecteur de langue : vers la fiche dans l'autre langue
    const navFiche = nav
        .replace(/<a href="[^"]*" lang="fr"([^>]*)>/, `<a href="${urlFiche(lieu.slug, 'fr')}" lang="fr"$1>`)
        .replace(/<a href="[^"]*" lang="en"([^>]*)>/, `<a href="${urlFiche(lieu.slug, 'en')}" lang="en"$1>`);

    // Galerie
    const galerie = photos.length
        ? photos.slice(0, 3).map((p, i) => `
            <button type="button" class="fiche-photo" data-photo="${escapeHtml(publicUrlFromPath(p.image))}" aria-label="${T.agrandir} ${i + 1}">
                <img src="${escapeHtml(publicUrlFromPath(i === 0 ? p.image : (p.vignette || p.image)))}" alt="${escapeHtml(lieu.nom)}"${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">
            </button>`).join('')
        : `<div class="fiche-photo fiche-photo--vide">${icone(famille, 'card-media-icon')}<span>${T.sansPhoto}</span></div>`;

    // Étiquettes : catégorie principale en Dymo, les autres en petit
    const etiquettes = cats.map((c, i) => {
        const f = FAMILLES[familleDuLieu({ categories: [c] }, categories)];
        return `<span class="fiche-label${i ? ' fiche-label--sec' : ''}" style="--fam:${f.couleur}">${icone(familleDuLieu({ categories: [c] }, categories))}${escapeHtml(nomCategorie(categories[c], lang))}</span>`;
    }).join('');

    const tagsListe = (lieu.tags || []).filter(t => tags[t])
        .map(t => `<li>${icone(aUneIcone(t) ? t : 'tag')}${escapeHtml(nomTag(tags[t], lang))}</li>`).join('');

    const paragraphes = longue.texte && longue.texte !== courte.texte
        ? longue.texte.split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join('\n')
        : '';

    // Infos pratiques
    const infos = [];
    if (lieu.adresse) infos.push([T.adresse, escapeHtml(lieu.adresse), 'pin']);
    if (prixTexte(lieu.prix)) infos.push([T.prix, `${prixTexte(lieu.prix)} <span class="fiche-info-note">${T.prixNiveaux[lieu.prix]}</span>`, null]);
    if (lieu.telephone) infos.push([T.telephone, `<a href="tel:${escapeHtml(lieu.telephone.replace(/[^\d+]/g, ''))}">${escapeHtml(lieu.telephone)}</a>`, 'telephone']);
    if (lieu.site) infos.push([T.site, `<a href="${escapeHtml(lieu.site)}" target="_blank" rel="noopener noreferrer">${escapeHtml(lieu.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`, 'site']);
    if (lieu.instagram) infos.push(['Instagram', `<a href="${escapeHtml(urlInstagram(lieu.instagram))}" target="_blank" rel="noopener noreferrer">${escapeHtml(lieu.instagram)}</a>`, 'instagram']);

    // À deux pas : les 4 lieux les plus proches
    const voisins = lieu.latitude != null
        ? tous.filter(l => l.id !== lieu.id && l.latitude != null)
            .map(l => ({ l, d: distance(lieu, l) })).sort((a, b) => a.d - b.d).slice(0, 4).map(x => x.l)
        : [];

    const jsonLd = [
        { "@context": "https://schema.org", ...lieuJsonLd(lieu, ctx), "inLanguage": lang === 'en' ? 'en-GB' : 'fr-FR' },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": lang === 'en' ? 'Places' : 'Lieux', "item": SITE + URL_LISTE[lang] },
                { "@type": "ListItem", "position": 2, "name": lieu.nom, "item": url }
            ]
        }
    ];

    return `<!DOCTYPE html>
<!-- Fichier généré par build-lieux.js depuis Firestore : ne pas modifier à la main -->
<html lang="${lang}">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(titre)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="fr" href="${urlFr}">
  <link rel="alternate" hreflang="en" href="${SITE + urlFiche(lieu.slug, 'en')}">
  <link rel="alternate" hreflang="x-default" href="${urlFr}">

  <meta property="og:type" content="place">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${escapeHtml(lieu.nom)}">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:locale" content="${lang === 'en' ? 'en_GB' : 'fr_FR'}">
  <meta property="og:site_name" content="Cours Ju — Plaine">
  ${lieu.latitude != null ? `<meta property="place:location:latitude" content="${lieu.latitude}">
  <meta property="place:location:longitude" content="${lieu.longitude}">` : ''}
  <meta name="twitter:card" content="summary_large_image">

  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <link rel="manifest" href="${lang === 'en' ? '/manifest-en.webmanifest' : '/manifest.webmanifest'}">
  <meta name="theme-color" content="#0c0c0b">
  <meta name="apple-mobile-web-app-title" content="Cours Ju">
  <script src="/i18n/ui.js"></script>
  <script src="/pwa.js" defer></script>

  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&family=Barlow:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/lieux.css">

  <script>
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/insights/script.js"></script>
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>
</head>

<body class="page-fiche" style="--fam:${couleur}">

  ${navFiche}

  <main class="fiche">
    <a class="fiche-retour" href="${URL_LISTE[lang]}">${icone('retour')}${T.tousLesLieux}</a>

    <div class="fiche-galerie fiche-galerie--${Math.min(photos.length, 3) || 1}">${galerie}
    </div>

    <div class="fiche-grid">
      <article class="fiche-texte">
        <div class="fiche-etiquettes">${etiquettes}${lieu.coupDeCoeur ? `<span class="fiche-coeur">${icone('coeur')}${T.coeur}</span>` : ''}</div>
        <h1 class="fiche-titre">${escapeHtml(lieu.nom)}</h1>
        ${courte.texte ? `<p class="fiche-chapo" lang="${courte.lang}">${escapeHtml(courte.texte)}</p>` : ''}
        ${paragraphes ? `<div class="fiche-desc" lang="${longue.lang}">\n${paragraphes}\n        </div>` : ''}
        ${tagsListe ? `<ul class="fiche-tags">${tagsListe}</ul>` : ''}
      </article>

      <aside class="fiche-infos" aria-label="${T.infos}">
        <h2 class="fiche-infos-titre">${T.infos}</h2>
        ${infos.length ? `<dl class="fiche-dl">${infos.map(([dt, dd, ic]) => `
          <div><dt>${ic ? icone(ic) : ''}${dt}</dt><dd>${dd}</dd></div>`).join('')}
        </dl>` : ''}
        ${lieu.latitude != null ? `<div class="fiche-map" id="ficheMap" data-lat="${lieu.latitude}" data-lng="${lieu.longitude}"></div>
        <a class="btn-plein fiche-itineraire" href="${urlItineraire(lieu)}" target="_blank" rel="noopener noreferrer">${icone('itineraire')}${T.itineraire}</a>` : ''}
      </aside>
    </div>

    ${voisins.length ? `<section class="fiche-voisins">
      <h2 class="fiche-voisins-titre">${T.aDeuxPas}</h2>
      <div class="cards-grid">${voisins.map(v => cardHTML(v, ctx)).join('')}
      </div>
    </section>` : ''}
  </main>

  <!-- Agrandissement des photos -->
  <div class="lightbox" id="lightbox" hidden>
    <button type="button" class="lightbox-close" id="lightboxClose" aria-label="${T.fermer}">${icone('fermer')}</button>
    <img src="" alt="${escapeHtml(lieu.nom)}" id="lightboxImage">
  </div>

  ${footer}

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="/script.js"></script>
  <script src="/lieu.js"></script>
  <script
    src="https://websites-monitoring.vercel.app/tracking.js?siteId=cours-julien&key=280e3472822f4f6a95f61310b65cf8fd0204ea08e8ae424eec5edef940ce9d2e"></script>
</body>

</html>
`;
}

// =====================
// 3. Sitemap : bloc des fiches, entre deux commentaires
// =====================
function ajouterAuSitemap(avecFiche) {
    const fichier = path.join(__dirname, 'sitemap.xml');
    if (!fs.existsSync(fichier)) return;
    let xml = fs.readFileSync(fichier, 'utf8');
    xml = xml.replace(/\s*<!-- fiches:debut -->[\s\S]*?<!-- fiches:fin -->/, '');

    const lignes = ['  <!-- fiches:debut -->'];
    for (const lieu of avecFiche) {
        const fr = SITE + urlFiche(lieu.slug, 'fr');
        const en = SITE + urlFiche(lieu.slug, 'en');
        const lastmod = (lieu.modifieLe || '').slice(0, 10);
        for (const loc of [fr, en]) {
            lignes.push('  <url>', `    <loc>${loc}</loc>`);
            if (lastmod) lignes.push(`    <lastmod>${lastmod}</lastmod>`);
            lignes.push(
                `    <xhtml:link rel="alternate" hreflang="fr" href="${fr}"/>`,
                `    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>`,
                `    <xhtml:link rel="alternate" hreflang="x-default" href="${fr}"/>`,
                '  </url>');
        }
    }
    lignes.push('  <!-- fiches:fin -->');
    xml = xml.replace('</urlset>', `${lignes.join('\n')}\n</urlset>`);
    fs.writeFileSync(fichier, xml, 'utf8');
    console.log(`Sitemap : ${avecFiche.length * 2} fiches.`);
}

buildLieux().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
