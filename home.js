// =====================================================================
// home.js — Page d'accueil « fanzine »
// ---------------------------------------------------------------------
// - Numéro et saison du fanzine (N° 07 — Automne 2026, puis un par saison)
// - Couverture : 5 façades tirées au hasard à chaque visite
// - Frise : façades en boucle (défilable à la main), couleur au survol
// - p. 1 Par envie : compteurs + aperçu d'un lieu de l'envie survolée
// - p. 2 Aujourd'hui / Ce soir, je vais… : tirage du jour + « Re-tirer »
// - p. 3 Le plan : points des lieux sur le plan stylisé (images/plan-quartier.svg)
// - Apparition des objets au défilement
// Les lieux viennent de Firestore (data-loader.js, avec cache hors ligne).
// =====================================================================

import { chargerDonnees } from './data-loader.js';
import { lieuPhotoUrl } from './storage-helpers.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// =====================
// Configuration éditoriale
// =====================

// Les envies regroupent des catégories Firestore (une catégorie peut servir deux envies)
const ENVIES = {
    'lire':         { cats: ['livres'] },
    'ecouter':      { cats: ['musique', 'concerts'] },
    'voir':         { cats: ['art', 'cinéma', 'théâtre'] },
    'chiner':       { cats: ['commerces', 'fringues', 'jeux'] },
    'manger':       { cats: ['restaurants', 'snacks', 'cafés'] },
    'trinquer':     { cats: ['bars'] },
    'danser':       { cats: ['nuit', 'concerts'] },
    'se-retrouver': { cats: ['social', 'kids'] }
};

// Tirage du jour : catégories prioritaires selon le moment, puis complément
const MOMENTS = {
    jour: {
        titre: CJ.t('home.jour'),
        priorite: ['livres', 'art', 'commerces', 'fringues', 'jeux', 'musique', 'social', 'kids', 'cafés', 'cinéma'],
        complement: ['restaurants', 'snacks', 'théâtre', 'concerts']
    },
    soir: {
        titre: CJ.t('home.soir'),
        priorite: ['bars', 'concerts', 'nuit', 'théâtre', 'cinéma'],
        complement: ['restaurants', 'art', 'musique']
    }
};
const SOIR_DEBUT = 19; // heure de Marseille
const SOIR_FIN = 5;

// Couverture : façades choisies (trame papier + couleur au survol)
const COUVERTURE = [
    ['livre-locussolus', 'Façade de la librairie Locus Solus', 'Front of the Locus Solus bookshop'],
    ['musique-tripsichord', 'Façade du disquaire Tripsichord Music', 'Front of the Tripsichord Music record shop'],
    ['social-maison', 'Façade peinte de la Maison pour tous, centre social Julien', 'Painted front of the Maison pour tous, the Julien community centre'],
    ['livre-memepasmal', 'Vitrine des éditions Même pas mal', 'Shop window of the Même pas mal publishing house'],
    ['musique-tangerine', 'Entrée peinte du disquaire Tangerine', 'Painted entrance of the Tangerine record shop'],
    ['livre-reserve', 'Façade peinte de la librairie La Réserve à Bulles', 'Painted front of the La Réserve à Bulles comic bookshop'],
    ['musique-galette', 'Devanture orange du disquaire Galette', 'Orange shopfront of the Galette record shop'],
    ['commerce-savonnerie', 'Enseigne de la Savonnerie marseillaise de la Licorne', 'Sign of the Savonnerie marseillaise de la Licorne soap shop'],
    ['jeu-crypte', 'Vitrine de La Crypte du Jeu', 'Shop window of La Crypte du Jeu games shop'],
    ['theatre-carrerond', 'Entrée du théâtre Le Carré Rond', 'Entrance of the Le Carré Rond theatre'],
    ['fringues-brickcity', 'Façade dessinée de la boutique Brick City', 'Hand-drawn front of the Brick City clothes shop'],
    ['social-affiches', 'Vitrine de Cinesud, affiches de cinéma', 'Window of Cinesud, a film poster shop'],
    ['dehors-escalier', 'Les escaliers du cours Julien et leur terrasse', 'The Cours Julien steps and their terrace'],
    ['art-serigraphie', "Vitrine de l'atelier de gravure de Vincent Tavernier", "Window of Vincent Tavernier's printmaking studio"],
    ['kids-chaussures', "Devanture verte de Savat'à Gosse", "Green shopfront of Savat'à Gosse, a children's shoe shop"]
];

const MIN_PHOTO_WIDTH = 480;

function track(name, params = {}) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
}

// =====================
// Utilitaires : hasard reproductible (tirage du jour)
// =====================
function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function seededRandom(seed) {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(list, random = Math.random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function parisNow() {
    const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type).value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function currentMoment() {
    const { hour } = parisNow();
    return hour >= SOIR_DEBUT || hour < SOIR_FIN ? 'soir' : 'jour';
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

// Précharge une photo et vérifie sa largeur (les photos trop petites ne vont pas en vitrine)
function loadPhoto(url, timeout = 6000) {
    return new Promise(resolve => {
        if (!url) return resolve(null);
        const img = new Image();
        const timer = setTimeout(() => resolve(null), timeout);
        img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth >= MIN_PHOTO_WIDTH ? url : null); };
        img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = url;
    });
}

// =====================
// Numéro du fanzine : N° 07 = automne 2026, puis un numéro par saison
const NUMERO_AUTOMNE_2026 = 7;
// =====================
function initEdition() {
    const now = new Date();
    const months = (now.getFullYear() - 2026) * 12 + (now.getMonth() - 8); // septembre 2026 = 0
    const index = Math.max(0, Math.floor(months / 3));
    const startMonth = (8 + index * 3) % 12;
    const year = 2026 + Math.floor((8 + index * 3) / 12);
    const saison = CJ.t('home.saison.' + { 8: 'automne', 11: 'hiver', 2: 'printemps', 5: 'ete' }[startMonth]);
    const numero = String(index + NUMERO_AUTOMNE_2026).padStart(2, '0');

    document.querySelectorAll('[data-edition]').forEach(el => {
        el.textContent = CJ.t('home.edition', { numero, saison, annee: year });
    });
    document.querySelectorAll('[data-edition-short]').forEach(el => {
        el.textContent = CJ.t('home.edition', { numero, saison: '', annee: '' }).replace(/\s*—.*$/, '');
    });
}

// =====================
// Couverture : composition recomposée à chaque visite
// =====================
function initCover() {
    const scraps = [...document.querySelectorAll('[data-cover] .zine-scrap')];
    if (!scraps.length) return;

    const picks = shuffle(COUVERTURE).slice(0, scraps.length);
    scraps.forEach((scrap, i) => {
        const [name, altFr, altEn] = picks[i];
        const img = scrap.querySelector('img');
        img.src = `/images/trame/${name}-480.png`;
        img.alt = CJ.lang === 'en' ? altEn : altFr;

        // Légère variation de l'inclinaison autour de la position prévue
        scrap.style.setProperty('--r-jitter', `${(Math.random() * 4 - 2).toFixed(1)}deg`);

        addColorLayer(scrap, `/images/web/${name}-480.webp`);
    });
}

// Couche couleur révélée au survol, chargée seulement au premier survol
function addColorLayer(container, src) {
    const color = document.createElement('img');
    color.className = 'zine-color';
    color.alt = '';
    color.setAttribute('aria-hidden', 'true');
    container.appendChild(color);
    container.addEventListener('pointerenter', () => { if (!color.src) color.src = src; }, { once: true });
}

// Photos posées dans la page (p. 5) : couleur au survol, comme la couverture
function initScrapColors() {
    document.querySelectorAll('.zine-scrap img[data-color]').forEach(img => {
        addColorLayer(img.parentElement, img.dataset.color);
    });
}

// =====================
// Frise : défilement automatique, mais on peut reprendre la main
// =====================
const FRISE_VITESSE = 40;      // px par seconde
const FRISE_REPRISE = 3000;    // ms d'inactivité avant de repartir

function initFrise() {
    const frise = document.querySelector('.zine-frise');
    const track = frise?.querySelector('[data-frise]');
    if (!track) return;

    track.querySelectorAll('.zine-frise-item').forEach(item => {
        const img = item.querySelector('img');
        addColorLayer(item, img.dataset.color);
    });

    initFriseDrag(frise);

    if (reduceMotion) return;
    // On duplique la rangée : arrivé au bout du premier exemplaire, on revient d'autant
    const originals = [...track.children];
    originals.forEach(item => {
        const clone = item.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('.zine-color').forEach(c => c.remove());
        addColorLayer(clone, item.querySelector('img').dataset.color);
        track.appendChild(clone);
    });

    // Largeur d'un exemplaire de la rangée (gouttières comprises)
    const firstClone = track.children[originals.length];
    let loop = 0;
    const measure = () => { loop = firstClone.offsetLeft - originals[0].offsetLeft; };
    measure();
    window.addEventListener('resize', measure);

    let pos = frise.scrollLeft;      // position voulue, avec ses fractions de pixel
    let expected = pos;              // dernière position écrite par nous
    let hover = false;
    let press = false;
    let focus = false;
    let visible = true;
    let resumeAt = 0;
    let last = performance.now();

    const setScroll = x => {
        pos = x;
        expected = x;
        frise.scrollLeft = x;
    };
    const pauseThenResume = () => { resumeAt = performance.now() + FRISE_REPRISE; };

    // Survol à la souris
    frise.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hover = true; });
    frise.addEventListener('pointerleave', e => {
        if (e.pointerType !== 'mouse') return;
        hover = false;
        pauseThenResume();
    });

    // Doigt ou bouton appuyé
    frise.addEventListener('pointerdown', () => { press = true; });
    const release = () => {
        if (!press) return;
        press = false;
        pauseThenResume();
    };
    frise.addEventListener('pointerup', release);
    frise.addEventListener('pointercancel', release);   // le navigateur prend le relais du défilement tactile
    window.addEventListener('pointerup', release);

    // Navigation au clavier (pas le focus laissé par un clic)
    frise.addEventListener('focusin', () => { focus = frise.matches(':focus-visible'); });
    frise.addEventListener('focusout', () => {
        if (!focus) return;
        focus = false;
        pauseThenResume();
    });

    // Défilement par l'utilisateur (doigt, pavé tactile, glisser, clavier)
    frise.addEventListener('scroll', () => {
        const x = frise.scrollLeft;
        if (Math.abs(x - expected) <= 1) return;   // c'est notre propre défilement
        pauseThenResume();
        if (x >= loop) setScroll(x - loop);
        else if (x <= 0) setScroll(x + loop);
        else { pos = x; expected = x; }
    }, { passive: true });

    // Inutile d'animer hors de l'écran
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(frise);
    }

    const tick = now => {
        const dt = Math.min(now - last, 100) / 1000;
        last = now;
        if (visible && loop > 0 && !hover && !press && !focus && now >= resumeAt) {
            let x = pos + FRISE_VITESSE * dt;
            if (x >= loop) x -= loop;
            setScroll(x);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

// Glisser la frise à la souris (au doigt, le navigateur s'en charge)
function initFriseDrag(frise) {
    let lastX = null;

    frise.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        lastX = e.clientX;
        frise.setPointerCapture(e.pointerId);
        frise.classList.add('is-dragging');
    });
    frise.addEventListener('pointermove', e => {
        if (lastX === null) return;
        frise.scrollLeft -= e.clientX - lastX;
        lastX = e.clientX;
    });
    const stop = () => {
        lastX = null;
        frise.classList.remove('is-dragging');
    };
    frise.addEventListener('pointerup', stop);
    frise.addEventListener('pointercancel', stop);
    frise.addEventListener('lostpointercapture', stop);
    // Firefox ignore -webkit-user-drag : pas d'image « fantôme » au glisser
    frise.addEventListener('dragstart', e => e.preventDefault());
}

// =====================
// Apparition des objets
// =====================
function initPose() {
    const items = document.querySelectorAll('[data-pose]');
    if (reduceMotion || !('IntersectionObserver' in window)) {
        items.forEach(el => el.classList.add('is-posed'));
        return;
    }
    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-posed');
            io.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -10% 0px' });

    // Décalage en cascade au sein d'un même groupe
    items.forEach(el => {
        const siblings = [...el.parentElement.querySelectorAll(':scope > [data-pose]')];
        el.style.setProperty('--pose-delay', `${siblings.indexOf(el) * 0.12}s`);
        io.observe(el);
    });
}

// =====================
// Moment de la journée
// =====================
function initMoment(moment) {
    const titre = MOMENTS[moment].titre;
    document.querySelectorAll('[data-moment-title], [data-moment-label]').forEach(el => { el.textContent = titre; });
}

// =====================
// p. 1 — Par envie
// =====================
function lieuxDeCategories(lieux, cats) {
    return lieux.filter(l => (l.categories || []).some(c => cats.includes(c)));
}

function initEnvies(lieux, categories) {
    const preview = document.querySelector('[data-envie-preview]');
    const previewImg = preview?.querySelector('[data-preview-img]');
    const previewName = preview?.querySelector('[data-preview-name]');
    const previewMeta = preview?.querySelector('[data-preview-meta]');
    let visibles = 0;

    document.querySelectorAll('[data-envie]').forEach(link => {
        const envie = ENVIES[link.dataset.envie];
        if (!envie) return;
        const items = lieuxDeCategories(lieux, envie.cats);
        if (!items.length) {
            link.closest('li').hidden = true;
            return;
        }
        visibles++;
        link.querySelector('.zine-dymo-count').textContent = items.length;

        // Le lien ouvre la catégorie principale de l'envie (la plus fournie)
        const main = envie.cats
            .filter(c => categories[c])
            .sort((a, b) => lieuxDeCategories(lieux, [b]).length - lieuxDeCategories(lieux, [a]).length)[0];
        link.href = CJ.url('lieux', `?filtre=${encodeURIComponent(main)}`);
        link.addEventListener('click', () => track('home_envie', { envie: link.dataset.envie }));

        const show = () => showPreview(link, items, main);
        link.addEventListener('pointerenter', show);
        link.addEventListener('focus', show);
    });

    const stat = document.querySelector('[data-stat="envies"]');
    if (stat) stat.textContent = visibles;

    function showPreview(link, items, main) {
        if (!preview) return;
        document.querySelectorAll('.zine-dymo.is-active').forEach(el => el.classList.remove('is-active'));
        link.classList.add('is-active');

        const withPhoto = items.filter(l => l.image);
        const lieu = withPhoto[Math.floor(Math.random() * withPhoto.length)] || items[0];
        previewImg.src = lieu.image ? lieuPhotoUrl(lieu, 'vignette') : '';
        previewImg.alt = lieu.nom;
        previewName.textContent = lieu.nom;
        previewMeta.textContent = `${CJ.desc(lieu)} · ${CJ.t('home.voirLes', { n: items.length })}`;
        preview.href = CJ.url('lieux', `?filtre=${encodeURIComponent(main)}`);
        preview.hidden = false;
    }

    // Aperçu par défaut : la première envie visible
    const first = [...document.querySelectorAll('[data-envie]')].find(l => !l.closest('li').hidden);
    if (first) first.dispatchEvent(new Event('pointerenter'));
}

// =====================
// p. 2 — Tirage du jour
// =====================
function initTirage(lieux, categories, moment) {
    const container = document.querySelector('[data-tirage]');
    const reroll = document.querySelector('[data-reroll]');
    if (!container) return;

    const conf = MOMENTS[moment];
    const avecPhoto = lieux.filter(l => l.image);
    const prioritaires = lieuxDeCategories(avecPhoto, conf.priorite);
    const complement = lieuxDeCategories(avecPhoto, conf.complement).filter(l => !prioritaires.includes(l));
    let tour = 0;

    async function draw() {
        const { date } = parisNow();
        const random = seededRandom(hashString(`${date}|${moment}|${tour}`));
        const candidats = [...shuffle(prioritaires, random), ...shuffle(complement, random)];

        renderPlaceholders();
        // Photos vérifiées par lots de 6 en parallèle, dans l'ordre du tirage
        const retenus = [];
        for (let i = 0; i < candidats.length && retenus.length < 3; i += 6) {
            const lot = candidats.slice(i, i + 6);
            const urls = await Promise.all(lot.map(l => loadPhoto(lieuPhotoUrl(l, 'vignette'))));
            lot.forEach((lieu, k) => { if (urls[k] && retenus.length < 3) retenus.push({ lieu, url: urls[k] }); });
        }
        render(retenus);
    }

    function renderPlaceholders() {
        container.innerHTML = Array.from({ length: 3 }, () => `
            <div class="zine-polaroid zine-polaroid--placeholder" aria-hidden="true">
                <span class="zine-polaroid-photo"></span>
                <span class="zine-polaroid-name">&nbsp;</span>
            </div>`).join('');
    }

    function render(retenus) {
        if (!retenus.length) {
            container.innerHTML = `<p class="zine-intro">${CJ.t('home.tirageVide', { url: CJ.url('lieux') })}</p>`;
            return;
        }
        container.innerHTML = retenus.map(({ lieu, url }) => {
            const cats = (lieu.categories || []).map(c => CJ.catNom(categories[c]) || c).join(' · ');
            return `
                <a class="zine-polaroid" href="${CJ.url('lieux', `?lieu=${encodeURIComponent(lieu.id)}`)}">
                    <span class="zine-polaroid-photo"><img src="${escapeHtml(url)}" alt="${escapeHtml(lieu.nom)}" loading="lazy"></span>
                    <span class="zine-polaroid-name">${escapeHtml(lieu.nom)}</span>
                    <span class="zine-type zine-polaroid-meta">${escapeHtml(cats)}</span>
                    ${CJ.desc(lieu) ? `<span class="zine-polaroid-text" lang="${CJ.descLang(lieu)}">${escapeHtml(CJ.desc(lieu))}</span>` : ''}
                </a>`;
        }).join('');
        if (tour > 0 && !reduceMotion) {
            container.querySelectorAll('.zine-polaroid').forEach(p => p.classList.add('is-flipping'));
        }
    }

    if (reroll) {
        reroll.hidden = prioritaires.length + complement.length <= 3;
        reroll.addEventListener('click', () => {
            tour++;
            track('home_tirage_reroll', { moment, tour });
            draw();
        });
    }

    draw();
}

// =====================
// p. 3 — Le plan
// =====================
async function initPlan(lieux, categories) {
    const holder = document.querySelector('[data-plan]');
    if (!holder) return;

    let svg;
    try {
        const res = await fetch('/images/plan-quartier.svg');
        const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
        svg = doc.documentElement;
    } catch (_) {
        return;
    }

    const lon0 = Number(svg.dataset.lon0);
    const lat0 = Number(svg.dataset.lat0);
    const kx = Number(svg.dataset.kx);
    const ky = Number(svg.dataset.ky);

    const ns = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', 'zine-plan-dots');

    shuffle(lieux.filter(l => l.latitude && l.longitude)).forEach((lieu, i) => {
        const cat = categories[(lieu.categories || [])[0]];
        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', ((lieu.longitude - lon0) * kx).toFixed(1));
        dot.setAttribute('cy', ((lat0 - lieu.latitude) * ky).toFixed(1));
        dot.setAttribute('r', '11');
        dot.setAttribute('fill', cat?.couleur || '#e05c2a');
        dot.setAttribute('class', 'zine-plan-dot');
        dot.style.setProperty('--d', `${(i * 0.03).toFixed(2)}s`);
        group.appendChild(dot);
    });

    svg.appendChild(group);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    holder.appendChild(document.importNode(svg, true));

    const minutes = document.querySelector('[data-stat="minutes"]');
    if (minutes && svg.dataset.maxMinutes) minutes.textContent = svg.dataset.maxMinutes;
}

// =====================
// Initialisation
// =====================
async function init() {
    const moment = currentMoment();
    initEdition();
    initMoment(moment);
    initCover();
    initFrise();
    initScrapColors();
    initPose();

    let lieux = [];
    let categories = {};
    try {
        ({ lieux, categories } = await chargerDonnees());
    } catch (err) {
        console.error('Accueil : lieux indisponibles', err);
        const tirage = document.querySelector('[data-tirage]');
        if (tirage) tirage.innerHTML = `<p class="zine-intro">${CJ.t('home.indisponible', { url: CJ.url('lieux') })}</p>`;
        return;
    }

    const stat = document.querySelector('[data-stat="lieux"]');
    if (stat) stat.textContent = lieux.length;

    initEnvies(lieux, categories);
    initTirage(lieux, categories, moment);
    initPlan(lieux, categories);
}

init();
