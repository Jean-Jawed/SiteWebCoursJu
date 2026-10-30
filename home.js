// =====================================================================
// home.js — Page d'accueil « fanzine »
// ---------------------------------------------------------------------
// - Numéro et saison du fanzine (N° 07 — Automne 2026, puis un par saison)
// - Couverture : 5 photos tirées au hasard à chaque visite (couverture.json,
//   préparé par scripts/build-couverture.py depuis images/originaux/couverture/)
// - Frise : façades en boucle (défilable à la main)
// - p. 1 Par envie : compteurs + aperçu d'un lieu de l'envie survolée
// - p. 2 Coups de cœur : trois à la fois, « D'autres coups de cœur » pour la suite
// - p. 3 Le plan : points des lieux sur le plan stylisé (images/plan-quartier.svg)
// - Apparition des objets au défilement
// Les lieux viennent de Firestore (data-loader.js, avec cache hors ligne).
// =====================================================================

import { chargerDonnees } from './data-loader.js';
import { lieuPhotoUrl } from './storage-helpers.js';
import { urlFiche } from './lieux-commun.js';

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
    'manger':       { cats: ['restaurants', 'snacks', 'cafés', 'glaces'] },
    'trinquer':     { cats: ['bars'] },
    'danser':       { cats: ['nuit', 'concerts'] },
    'se-retrouver': { cats: ['social', 'kids'] }
};

function track(name, params = {}) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
}

// =====================
// Utilitaires
// =====================
function shuffle(list, random = Math.random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
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
async function initCover() {
    const scraps = [...document.querySelectorAll('[data-cover] .zine-scrap')];
    if (!scraps.length) return;

    let photos;
    try {
        photos = await fetch('/couverture.json').then(r => r.json());
    } catch (_) {
        return; // hors ligne : on garde les photos écrites dans la page
    }
    const picks = shuffle(photos).slice(0, scraps.length);
    scraps.forEach((scrap, i) => {
        const photo = picks[i];
        const img = scrap.querySelector('img');
        if (!photo || !img) return;
        img.srcset = `${photo.src} 600w, ${photo.src2x} 1200w`;
        img.src = photo.src;
        img.alt = (CJ.lang === 'en' ? photo.alt_en : photo.alt) || '';

        // Légère variation de l'inclinaison autour de la position prévue
        scrap.style.setProperty('--r-jitter', `${(Math.random() * 4 - 2).toFixed(1)}deg`);
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

    initFriseDrag(frise);

    if (reduceMotion) return;
    // On duplique la rangée : arrivé au bout du premier exemplaire, on revient d'autant
    const originals = [...track.children];
    originals.forEach(item => {
        const clone = item.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
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

        const withPhoto = items.filter(l => lieuPhotoUrl(l));
        const lieu = withPhoto[Math.floor(Math.random() * withPhoto.length)] || items[0];
        previewImg.src = lieuPhotoUrl(lieu, 'vignette') || '';
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
// p. 2 — Coups de cœur
// =====================
const COEURS_PAR_PAGE = 3;

// Lieux qui ont une fiche (liste écrite dans la page par build-lieux.js)
const FICHES = (() => {
    try { return new Set(JSON.parse(document.getElementById('lieuxFiches')?.textContent || '[]')); }
    catch (_) { return new Set(); }
})();

function lienLieu(lieu) {
    return lieu.slug && FICHES.has(lieu.slug)
        ? urlFiche(lieu.slug, CJ.lang)
        : CJ.url('lieux', `?lieu=${encodeURIComponent(lieu.id)}`);
}

function renderCoeursAttente() {
    const container = document.querySelector('[data-coeurs]');
    if (!container) return;
    container.innerHTML = Array.from({ length: COEURS_PAR_PAGE }, () => `
        <div class="zine-polaroid zine-polaroid--placeholder" aria-hidden="true">
            <span class="zine-polaroid-photo"></span>
            <span class="zine-polaroid-name">&nbsp;</span>
        </div>`).join('');
}

function initCoeurs(lieux, categories) {
    const container = document.querySelector('[data-coeurs]');
    const suivants = document.querySelector('[data-coeurs-suivants]');
    if (!container) return;

    // Ordre mélangé à chaque visite, puis on avance trois par trois
    const coeurs = shuffle(lieux.filter(l => l.coupDeCoeur));
    let page = 0;

    function render() {
        if (!coeurs.length) {
            container.innerHTML = `<p class="zine-intro">${CJ.t('home.coeursVide', { url: CJ.url('lieux') })}</p>`;
            return;
        }
        const n = Math.min(COEURS_PAR_PAGE, coeurs.length);
        const lot = Array.from({ length: n }, (_, i) => coeurs[(page * COEURS_PAR_PAGE + i) % coeurs.length]);
        container.innerHTML = lot.map(lieu => {
            const cats = (lieu.categories || []).map(c => CJ.catNom(categories[c]) || c).join(' · ');
            const photo = lieuPhotoUrl(lieu, 'vignette');
            return `
                <a class="zine-polaroid" href="${lienLieu(lieu)}">
                    <span class="zine-polaroid-photo">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(lieu.nom)}" loading="lazy">` : ''}</span>
                    <span class="zine-polaroid-name">${escapeHtml(lieu.nom)}</span>
                    <span class="zine-type zine-polaroid-meta">${escapeHtml(cats)}</span>
                    ${CJ.desc(lieu) ? `<span class="zine-polaroid-text" lang="${CJ.descLang(lieu)}">${escapeHtml(CJ.desc(lieu))}</span>` : ''}
                </a>`;
        }).join('');
        if (page > 0 && !reduceMotion) {
            container.querySelectorAll('.zine-polaroid').forEach(p => p.classList.add('is-flipping'));
        }
    }

    if (suivants) {
        suivants.hidden = coeurs.length <= COEURS_PAR_PAGE;
        suivants.addEventListener('click', () => {
            page++;
            track('home_coeurs_suivants', { page });
            render();
        });
    }

    render();
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
    initEdition();
    initCover();
    renderCoeursAttente();
    initFrise();
    initPose();

    let lieux = [];
    let categories = {};
    try {
        ({ lieux, categories } = await chargerDonnees());
    } catch (err) {
        console.error('Accueil : lieux indisponibles', err);
        const coeurs = document.querySelector('[data-coeurs]');
        if (coeurs) coeurs.innerHTML = `<p class="zine-intro">${CJ.t('home.indisponible', { url: CJ.url('lieux') })}</p>`;
        return;
    }

    const stat = document.querySelector('[data-stat="lieux"]');
    if (stat) stat.textContent = lieux.length;

    initEnvies(lieux, categories);
    initCoeurs(lieux, categories);
    initPlan(lieux, categories);
}

init();
