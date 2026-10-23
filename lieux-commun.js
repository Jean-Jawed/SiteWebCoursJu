// =====================
// lieux-commun.js — Ce qui est partagé entre le navigateur (lieux.js, admin.js)
// et le build Node (build-lieux.js) : familles, icônes, photos, liens des fiches
// et gabarit des cartes de la liste.
// Module sans dépendance (ni DOM ni Firebase) : importable des deux côtés.
// =====================

export const STORAGE_BUCKET = 'cours-julien.firebasestorage.app';

// ---------------------
// Familles : regroupent les catégories, donnent la couleur des points et des étiquettes.
// Tons sérigraphie, lisibles sur le fond sombre ; l'orange du site reste réservé aux actions.
// L'ordre est celui des filtres. Les couleurs sont reprises en dur dans lieux.html (filtres).
// ---------------------
export const FAMILLES = {
    manger:    { nom: 'Manger',    nom_en: 'Eat',     couleur: '#e3b448' },
    boire:     { nom: 'Boire',     nom_en: 'Drink',   couleur: '#d98a9a' },
    sortir:    { nom: 'Sortir',    nom_en: 'Go out',  couleur: '#9a86e8' },
    culture:   { nom: 'Culture',   nom_en: 'Culture', couleur: '#5bb8a8' },
    boutiques: { nom: 'Boutiques', nom_en: 'Shops',   couleur: '#79a6dd' }
};

// Famille par défaut d'une catégorie qui n'a pas encore son champ « famille » (admin)
const FAMILLE_PAR_CATEGORIE = {
    restaurants: 'manger', snacks: 'manger',
    bars: 'boire', 'cafés': 'boire',
    nuit: 'sortir', concerts: 'sortir', jeux: 'sortir',
    art: 'culture', 'cinéma': 'culture', 'théâtre': 'culture', livres: 'culture', social: 'culture',
    commerces: 'boutiques', fringues: 'boutiques', musique: 'boutiques', kids: 'boutiques'
};

export function familleDe(cleCategorie, categorie) {
    const f = categorie?.famille || FAMILLE_PAR_CATEGORIE[cleCategorie];
    return FAMILLES[f] ? f : 'culture';
}

// Famille d'un lieu : celle de sa catégorie principale (la première)
export function familleDuLieu(lieu, categories) {
    const cle = (lieu.categories || [])[0];
    return familleDe(cle, categories[cle]);
}

export function nomFamille(cle, lang) {
    const f = FAMILLES[cle];
    return f ? (lang === 'en' ? f.nom_en : f.nom) : '';
}

export function nomCategorie(cat, lang) {
    if (!cat) return '';
    return (lang === 'en' && cat.nom_en) || cat.nom || '';
}

export function nomTag(tag, lang) {
    if (!tag) return '';
    return (lang === 'en' && tag.nom_en) || tag.nom || '';
}

// ---------------------
// Icônes au trait (24 × 24, contour 1,75) — remplacent les émojis
// ---------------------
const TRACES = {
    manger: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11M17 21V3c-2.2 0-3.5 2.5-3.5 6 0 2.6 1.2 4 3.5 4"/>',
    boire: '<path d="M7 3h10l-1 6a4 4 0 0 1-8 0L7 3zM12 13v8M8.5 21h7M7.4 6.5h9.2"/>',
    sortir: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    culture: '<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="m3.5 16 5-5 4.5 4.5 3-3 4.5 4.5"/><circle cx="15.5" cy="8.5" r="1.4"/>',
    boutiques: '<path d="M5 8h14l-1.2 12.5H6.2L5 8zM9 10V7a3 3 0 0 1 6 0v3"/>',
    terrasse: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    vegetarien: '<path d="M5 19.5c0-8.5 5.5-15 15-15 0 9.5-6.5 15-15 15zM5 19.5 13 11.5"/>',
    nouveau: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/>',
    ancien: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    coeur: '<path d="M12 20.5s-7.5-4.6-7.5-10.4A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.5c0 5.8-7.5 10.4-7.5 10.4z"/>',
    danser: '<circle cx="13" cy="4.5" r="1.8"/><path d="m8 21 3-6.5 2.5 2V21M6.5 10.5 10 8.5l4 1 3 3M11 14.5l1.5-5"/>',
    concert: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    om: '<circle cx="12" cy="12" r="8.5"/><path d="m12 7.5 3.3 2.4-1.3 3.9h-4l-1.3-3.9L12 7.5zM12 3.5v4M15.3 9.9l4.4-1.2M14 13.8l2.6 3.8M10 13.8l-2.6 3.8M8.7 9.9 4.3 8.7"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    recherche: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    telephone: '<path d="M6.6 3.5h2.6l1.4 4-2 1.4a12 12 0 0 0 6.5 6.5l1.4-2 4 1.4v2.6a2 2 0 0 1-2.2 2C10.4 19 5 13.6 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
    site: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>',
    itineraire: '<path d="M3.5 11 20.5 3.5 13 20.5l-2-7.5-7.5-2z"/>',
    fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    retour: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    fermer: '<path d="M6 6l12 12M18 6 6 18"/>',
    viser: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5"/>',
    suivre: '<path d="M12 2.5 19.5 21 12 16.5 4.5 21 12 2.5z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    liste: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    carte: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
    tag: '<path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1 1 0 0 1 0 1.4l-7.7 7.7a1 1 0 0 1-1.4 0l-8-8z"/><circle cx="8" cy="8" r="1.4"/>'
};

export function icone(nom, classe = 'ui-icon') {
    const trace = TRACES[nom] || TRACES.tag;
    return `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${trace}</svg>`;
}

export const aUneIcone = (nom) => nom in TRACES;

// ---------------------
// Textes partagés (cartes et fiches), en français et en anglais
// ---------------------
export const TEXTES = {
    fr: {
        coeur: 'Coup de cœur',
        voirFiche: 'Voir la fiche',
        itineraire: 'Itinéraire',
        tousLesLieux: 'Tous les lieux',
        aDeuxPas: 'À deux pas',
        infos: 'Infos pratiques',
        adresse: 'Adresse',
        prix: 'Prix',
        site: 'Site web',
        telephone: 'Téléphone',
        sansPhoto: 'Pas encore de photo',
        agrandir: 'Agrandir la photo',
        fermer: 'Fermer',
        prixNiveaux: { 1: 'Petit budget', 2: 'Prix moyens', 3: 'Plus cher' }
    },
    en: {
        coeur: 'Our pick',
        voirFiche: 'See the page',
        itineraire: 'Directions',
        tousLesLieux: 'All places',
        aDeuxPas: 'Close by',
        infos: 'Practical info',
        adresse: 'Address',
        prix: 'Price',
        site: 'Website',
        telephone: 'Phone',
        sansPhoto: 'No photo yet',
        agrandir: 'Enlarge the photo',
        fermer: 'Close',
        prixNiveaux: { 1: 'Budget', 2: 'Mid-range', 3: 'Pricier' }
    }
};

// ---------------------
// Photos (Firebase Storage, lecture publique)
// ---------------------
export function publicUrlFromPath(path) {
    if (!path) return null;
    return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
}

/**
 * Photos d'un lieu, la première étant la photo principale.
 * Les fiches d'avant les photos multiples n'ont que image/vignette : on les reprend.
 */
export function photosDuLieu(lieu) {
    if (!lieu) return [];
    if (Array.isArray(lieu.photos)) {
        return lieu.photos.filter(p => p?.image).map(p => ({ image: p.image, vignette: p.vignette || '' }));
    }
    return lieu.image ? [{ image: lieu.image, vignette: lieu.vignette || '' }] : [];
}

// ---------------------
// Liens et petits formats
// ---------------------
export function urlFiche(slug, lang) {
    return lang === 'en' ? `/en/places/${slug}.html` : `/lieux/${slug}.html`;
}

export function urlItineraire(lieu) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lieu.latitude},${lieu.longitude}&travelmode=walking`;
}

export function urlInstagram(compte) {
    return `https://instagram.com/${String(compte).replace(/^@/, '')}`;
}

// « 7 rue Crudère, 13006 Marseille » → « 7 rue Crudère »
export function adresseCourte(adresse) {
    return (adresse || '').replace(/,?\s*\d{5}\s*Marseille.*$/i, '').trim();
}

export function prixTexte(prix) {
    return [1, 2, 3].includes(prix) ? '€'.repeat(prix) : '';
}

export function descriptionDuLieu(lieu, lang) {
    if (lang === 'en' && lieu.description_en) return { texte: lieu.description_en, lang: 'en' };
    return { texte: lieu.description || '', lang: 'fr' };
}

export function descriptionLongue(lieu, lang) {
    if (lang === 'en' && lieu.description_longue_en) return { texte: lieu.description_longue_en, lang: 'en' };
    if (lieu.description_longue) return { texte: lieu.description_longue, lang: 'fr' };
    return descriptionDuLieu(lieu, lang);
}

export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Tri alphabétique à la française (accents, majuscules)
export const triParNom = (a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' });

// Distance approximative en mètres (suffisant à l'échelle d'un quartier)
export function distance(a, b) {
    const dLat = (b.latitude - a.latitude) * 111320;
    const dLng = (b.longitude - a.longitude) * 111320 * Math.cos(a.latitude * Math.PI / 180);
    return Math.hypot(dLat, dLng);
}

// ---------------------
// Carte de la liste (même gabarit pour le build et pour le navigateur)
//   ctx = { lang, categories, tags, aUneFiche(lieu) }
// ---------------------
export function cardHTML(lieu, ctx) {
    const { lang, categories, tags } = ctx;
    const T = TEXTES[lang];
    const cleCat = (lieu.categories || [])[0];
    const famille = familleDuLieu(lieu, categories);
    const couleur = FAMILLES[famille].couleur;
    const etiquette = nomCategorie(categories[cleCat], lang) || nomFamille(famille, lang);
    const photo = photosDuLieu(lieu)[0];
    const desc = descriptionDuLieu(lieu, lang);
    const fiche = lieu.slug && ctx.aUneFiche(lieu);

    const media = photo
        ? `<img src="${escapeHtml(publicUrlFromPath(photo.vignette || photo.image))}" alt="" loading="lazy" decoding="async">`
        : `<span class="card-media-vide">${icone(famille, 'card-media-icon')}</span>`;

    const tagsIcones = (lieu.tags || [])
        .filter(t => tags[t] && aUneIcone(t))
        .map(t => `<span class="card-tag" title="${escapeHtml(nomTag(tags[t], lang))}">${icone(t)}<span class="visually-hidden">${escapeHtml(nomTag(tags[t], lang))}</span></span>`)
        .join('');
    const infos = [adresseCourte(lieu.adresse), prixTexte(lieu.prix)].filter(Boolean)
        .map(x => `<span>${escapeHtml(x)}</span>`).join('<span aria-hidden="true">·</span>');

    return `
        <article class="lieu-card" data-id="${escapeHtml(lieu.id)}" style="--fam:${couleur}">
            <a class="card-link" href="${fiche ? urlFiche(lieu.slug, lang) : '#carte'}"${fiche ? '' : ' data-sans-fiche'}>
                <span class="card-media">
                    ${media}
                    <span class="card-label">${icone(famille)}${escapeHtml(etiquette)}</span>
                    ${lieu.coupDeCoeur ? `<span class="card-coeur">${icone('coeur')}${T.coeur}</span>` : ''}
                </span>
                <span class="card-body">
                    <h3 class="card-title">${escapeHtml(lieu.nom)}</h3>
                    ${desc.texte ? `<span class="card-description" lang="${desc.lang}">${escapeHtml(desc.texte)}</span>` : ''}
                    ${infos || tagsIcones ? `<span class="card-meta">${infos}${tagsIcones ? `<span class="card-tags">${tagsIcones}</span>` : ''}</span>` : ''}
                </span>
            </a>
        </article>`;
}
