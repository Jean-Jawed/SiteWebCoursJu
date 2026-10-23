// =====================
// lieux.js — Page Lieux : filtres, liste et carte
//   ordinateur (≥ 1100 px) : liste et carte côte à côte, synchronisées
//   mobile : liste, ou carte plein écran via le bouton flottant (#carte)
// =====================

import { chargerDonnees } from './data-loader.js';
import {
    FAMILLES, TEXTES, cardHTML, familleDuLieu, nomFamille, nomCategorie, nomTag, icone, aUneIcone,
    photosDuLieu, publicUrlFromPath, urlFiche, urlItineraire, adresseCourte, prixTexte,
    descriptionDuLieu, escapeHtml, triParNom, familleDe
} from './lieux-commun.js';

const LANG = CJ.lang;
const T = TEXTES[LANG];

// =====================
// État
// =====================
let lieux = [];
let categories = {};
let tags = {};
const filtres = { famille: '', categorie: '', tags: new Set(), prix: new Set(), recherche: '' };
let currentView = 'list';      // vue mobile : 'list' | 'map'
let selectedId = null;
let savedListScroll = 0;

// Lieux ayant une page générée au dernier build (les autres s'ouvrent sur la carte)
const FICHES = (() => {
    try { return new Set(JSON.parse(document.getElementById('lieuxFiches')?.textContent || '[]')); }
    catch (_) { return new Set(); }
})();
const aUneFiche = (lieu) => FICHES.has(lieu.slug);

const WIDE = window.matchMedia('(min-width: 1100px)');
const isWide = () => WIDE.matches;

// Fond de carte sombre CARTO
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_49bf_1_6cd23bb70be548965ad61a75';
const TILE_OPTIONS = {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
};
const QUARTIER_CENTER = [43.29398, 5.3843];
const ZOOM_NOMS = 18;          // à partir de ce zoom, les noms s'affichent à côté des points

// Carte
let map = null;
let cluster = null;
const markers = new Map();     // id → L.Marker

const FAB_INTRO_KEY = 'lieux-fab-intro-vu';

// Géolocalisation
let userMarker = null;
let userAccuracyCircle = null;
let locateOnceBtn = null;
let locateLiveBtn = null;
let locateBusy = false;
let pendingLocateMode = null;  // 'once' | 'live' | null
let liveWatching = false;
let liveFirstFix = false;
let lastLocationErrorToastAt = 0;

// =====================
// Initialisation
// =====================
document.addEventListener('DOMContentLoaded', async () => {
    initNavBurger();
    initFiltres();
    initListe();
    initViewFab();
    initMapCard();
    syncStickyTop();
    window.addEventListener('resize', syncStickyTop);
    WIDE.addEventListener('change', onBreakpointChange);

    if (isWide()) initMap();
    if (location.hash === '#carte' && !isWide()) switchView('map', { source: 'url', updateHistory: false });

    try {
        ({ lieux, categories, tags } = await chargerDonnees());
        lieux.sort(triParNom);
        renderOptions();
        render();
        if (map) addMarkers();
        applyUrlParams();
    } catch (err) {
        console.error('Erreur chargement données:', err);
        document.getElementById('cardsGrid').innerHTML =
            `<p class="list-empty">${CJ.t('lieux.chargementErreur')}</p>`;
    }
});

// Liens depuis l'accueil et l'extérieur :
//   lieux.html?filtre=livres   → filtré sur une catégorie (et sa famille)
//   lieux.html?famille=boire   → filtré sur une famille
//   lieux.html?lieu=23         → lieu sélectionné sur la carte
function applyUrlParams() {
    const params = new URLSearchParams(location.search);
    const filtre = params.get('filtre');
    const famille = params.get('famille');
    const lieuId = params.get('lieu');

    if (filtre && categories[filtre]) {
        filtres.famille = familleDe(filtre, categories[filtre]);
        filtres.categorie = filtre;
    } else if (famille && FAMILLES[famille]) {
        filtres.famille = famille;
    }
    if (filtre || famille) {
        renderOptions();
        render();
    }
    if (lieuId && lieux.some(l => String(l.id) === lieuId)) {
        if (!isWide()) switchView('map', { source: 'url' });
        selectLieu(lieuId, { source: 'url' });
    }
}

// =====================
// Menu burger
// =====================
function initNavBurger() {
    const burger = document.getElementById('navBurger');
    const menu = document.getElementById('navMenu');
    if (!burger || !menu) return;

    burger.addEventListener('click', () => {
        const isOpen = menu.classList.toggle('open');
        burger.classList.toggle('open', isOpen);
        burger.setAttribute('aria-expanded', isOpen);
    });

    menu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            menu.classList.remove('open');
            burger.classList.remove('open');
            burger.setAttribute('aria-expanded', 'false');
        });
    });
}

// Hauteur occupée en haut par la nav et la barre de filtres (collantes)
function syncStickyTop() {
    const nav = document.getElementById('siteNav');
    const bar = document.getElementById('filtresBar');
    const navH = nav ? nav.offsetHeight : 0;
    document.documentElement.style.setProperty('--nav-h', `${navH}px`);
    document.documentElement.style.setProperty('--sticky-top', `${navH + (bar ? bar.offsetHeight : 0)}px`);
    if (map) map.invalidateSize();
}

// =====================
// Filtres
// =====================
function initFiltres() {
    document.getElementById('famillesChips').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-famille]');
        if (!btn) return;
        const famille = btn.dataset.famille;
        filtres.famille = filtres.famille === famille ? '' : famille;
        filtres.categorie = '';
        renderOptions();
        render();
        track('lieux_filtre', { famille: filtres.famille || 'tout' });
    });

    document.getElementById('optionsChips').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.dataset.categorie !== undefined) {
            filtres.categorie = filtres.categorie === btn.dataset.categorie ? '' : btn.dataset.categorie;
        } else if (btn.dataset.tag) {
            basculer(filtres.tags, btn.dataset.tag);
        } else if (btn.dataset.prix) {
            basculer(filtres.prix, Number(btn.dataset.prix));
        }
        renderOptions();
        render();
    });

    let timer = null;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            filtres.recherche = e.target.value.trim();
            render();
        }, 120);
    });

    document.getElementById('resetFilters').addEventListener('click', () => {
        Object.assign(filtres, { famille: '', categorie: '', recherche: '' });
        filtres.tags.clear();
        filtres.prix.clear();
        document.getElementById('searchInput').value = '';
        renderOptions();
        render();
    });
}

function basculer(ensemble, valeur) {
    if (ensemble.has(valeur)) ensemble.delete(valeur);
    else ensemble.add(valeur);
}

const filtresActifs = () => !!(filtres.famille || filtres.categorie || filtres.recherche || filtres.tags.size || filtres.prix.size);

// Deuxième rangée : sous-catégories de la famille choisie, puis tags et prix
function renderOptions() {
    document.querySelectorAll('#famillesChips [data-famille]').forEach(btn => {
        const actif = btn.dataset.famille === filtres.famille;
        btn.classList.toggle('is-active', actif);
        btn.setAttribute('aria-pressed', String(actif));
    });

    const parts = [];
    if (filtres.famille) {
        const utilisees = new Set();
        lieux.forEach(l => (l.categories || []).forEach(c => {
            if (categories[c] && familleDe(c, categories[c]) === filtres.famille) utilisees.add(c);
        }));
        const sousCats = [...utilisees].sort((a, b) => nomCategorie(categories[a], LANG).localeCompare(nomCategorie(categories[b], LANG), 'fr'));
        if (sousCats.length > 1) {
            parts.push(...sousCats.map(c => chip({ attr: `data-categorie="${escapeHtml(c)}"`, actif: filtres.categorie === c, label: nomCategorie(categories[c], LANG) })));
            parts.push('<span class="chips-sep" aria-hidden="true"></span>');
        }
    }

    // Tags utilisés par au moins un lieu, coups de cœur en premier
    const tagsUtilises = new Set();
    lieux.forEach(l => (l.tags || []).forEach(t => tags[t] && tagsUtilises.add(t)));
    if (lieux.some(l => l.coupDeCoeur)) parts.push(chip({ attr: 'data-tag="coeur"', actif: filtres.tags.has('coeur'), label: T.coeur, icon: 'coeur' }));
    [...tagsUtilises].sort((a, b) => nomTag(tags[a], LANG).localeCompare(nomTag(tags[b], LANG), 'fr')).forEach(t => {
        parts.push(chip({ attr: `data-tag="${escapeHtml(t)}"`, actif: filtres.tags.has(t), label: nomTag(tags[t], LANG), icon: aUneIcone(t) ? t : 'tag' }));
    });
    if (lieux.some(l => prixTexte(l.prix))) {
        parts.push('<span class="chips-sep" aria-hidden="true"></span>');
        [1, 2, 3].forEach(p => parts.push(chip({ attr: `data-prix="${p}" title="${T.prixNiveaux[p]}"`, actif: filtres.prix.has(p), label: prixTexte(p) })));
    }

    document.getElementById('optionsChips').innerHTML = parts.join('');
    syncStickyTop();
}

function chip({ attr, actif, label, icon }) {
    return `<button type="button" class="chip chip--small${actif ? ' is-active' : ''}" ${attr} aria-pressed="${actif}">${icon ? icone(icon) : ''}<span>${escapeHtml(label)}</span></button>`;
}

function filteredLieux() {
    const q = normaliser(filtres.recherche);
    return lieux.filter(l => {
        // Un lieu appartient à toutes les familles de ses catégories (bar-restaurant : Boire et Manger)
        if (filtres.famille && !(l.categories || []).some(c => familleDe(c, categories[c]) === filtres.famille)) return false;
        if (filtres.categorie && !(l.categories || []).includes(filtres.categorie)) return false;
        for (const t of filtres.tags) {
            if (t === 'coeur' ? !l.coupDeCoeur : !(l.tags || []).includes(t)) return false;
        }
        if (filtres.prix.size && !filtres.prix.has(l.prix)) return false;
        if (q) {
            const texte = normaliser([l.nom, l.description, l.description_en, l.adresse,
                ...(l.categories || []).map(c => nomCategorie(categories[c], LANG))].join(' '));
            if (!texte.includes(q)) return false;
        }
        return true;
    });
}

// Recherche insensible aux accents et à la casse
function normaliser(texte) {
    return (texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// =====================
// Rendu : liste + carte
// =====================
function render() {
    const items = filteredLieux();
    renderList(items);
    applyFilterOnMap(items);
    document.getElementById('resetFilters').hidden = !filtresActifs();
}

function renderList(items) {
    const grid = document.getElementById('cardsGrid');
    document.getElementById('listCount').textContent = CJ.t('lieux.count', { n: items.length });
    document.getElementById('listEmpty').hidden = items.length > 0;

    const ctx = { lang: LANG, categories, tags, aUneFiche };
    grid.innerHTML = items.map(l => cardHTML(l, ctx)).join('');
    if (selectedId) grid.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.classList.add('is-selected');
}

// Survol d'une carte → point mis en avant ; clic sur un lieu sans fiche → carte
function initListe() {
    const grid = document.getElementById('cardsGrid');

    grid.addEventListener('mouseover', (e) => {
        const card = e.target.closest('.lieu-card');
        if (card && !card.contains(e.relatedTarget)) setHot(card.dataset.id, true);
    });
    grid.addEventListener('mouseout', (e) => {
        const card = e.target.closest('.lieu-card');
        if (card && !card.contains(e.relatedTarget)) setHot(card.dataset.id, false);
    });

    grid.addEventListener('click', (e) => {
        const link = e.target.closest('.card-link[data-sans-fiche]');
        if (!link) return;
        e.preventDefault();
        const id = link.closest('.lieu-card').dataset.id;
        if (!isWide()) switchView('map', { source: 'card' });
        selectLieu(id, { source: 'card' });
    });
}

function setHot(id, hot) {
    const el = markers.get(id)?.getElement();
    if (el) el.classList.toggle('is-hot', hot);
}

// =====================
// Vue mobile : liste ⇄ carte plein écran
// =====================
function switchView(view, { source = 'fab', updateHistory = true } = {}) {
    if (view === currentView) return;
    if (view !== 'map' && liveWatching) stopLiveTracking();

    const isMap = view === 'map';
    if (isMap) savedListScroll = window.scrollY;
    currentView = view;
    document.body.classList.toggle('is-map-view', isMap);
    updateViewFab();

    if (isMap) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        syncStickyTop();
        if (!map) initMap();
        else setTimeout(() => map.invalidateSize(), 30);
    } else {
        closeMapCard();
        window.scrollTo({ top: savedListScroll, behavior: 'instant' });
    }

    if (updateHistory) syncHistory(view);
    track('lieux_view_switch', { view, source });
}

// La carte a sa propre entrée d'historique (#carte) : « Retour » ramène à la liste
function syncHistory(view) {
    if (view === 'map') {
        if (location.hash !== '#carte') history.pushState({ view: 'map' }, '', '#carte');
    } else if (location.hash === '#carte') {
        if (history.state && history.state.view === 'map') history.back();
        else history.replaceState(null, '', location.pathname + location.search);
    }
}

window.addEventListener('popstate', () => {
    if (isWide()) return;
    switchView(location.hash === '#carte' ? 'map' : 'list', { source: 'history', updateHistory: false });
});

// Passage ordinateur ⇄ mobile (rotation, redimensionnement)
function onBreakpointChange() {
    if (isWide()) {
        document.body.classList.remove('is-map-view');
        currentView = 'list';
        updateViewFab();
        if (!map) initMap();
    }
    syncStickyTop();
}

function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
}

// =====================
// Bouton flottant Liste / Carte (mobile)
// =====================
function initViewFab() {
    const fab = document.getElementById('viewFab');
    if (!fab) return;

    fab.addEventListener('click', () => {
        switchView(currentView === 'list' ? 'map' : 'list', { source: 'fab' });
    });

    // S'efface quand le footer arrive (évite de masquer le CTA « Installer l'app »)
    const footer = document.querySelector('.main-footer');
    if (footer && 'IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            fab.classList.toggle('is-away', entry.isIntersecting && currentView === 'list');
        }).observe(footer);
    }

    try {
        if (!localStorage.getItem(FAB_INTRO_KEY)) {
            fab.classList.add('is-intro');
            localStorage.setItem(FAB_INTRO_KEY, '1');
        }
    } catch (_) {}

    updateViewFab();
}

function updateViewFab() {
    const fab = document.getElementById('viewFab');
    if (!fab) return;
    const isMap = currentView === 'map';
    fab.classList.toggle('is-map', isMap);
    fab.classList.remove('is-away');
    fab.querySelector('.view-fab-label').textContent = CJ.t(isMap ? 'lieux.fab.liste' : 'lieux.fab.carte');
    fab.querySelector('[data-fab-icon="map"]').hidden = isMap;
    fab.querySelector('[data-fab-icon="list"]').hidden = !isMap;
    fab.setAttribute('aria-label', CJ.t(isMap ? 'lieux.fab.versListe' : 'lieux.fab.versCarte'));
    fab.setAttribute('aria-controls', isMap ? 'viewList' : 'viewMap');
}

// =====================
// Carte
// =====================
function initMap() {
    if (map || typeof L === 'undefined') return;
    map = L.map('map', { zoomControl: true, minZoom: 14 }).setView(QUARTIER_CENTER, 16);
    L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(map);

    cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 28,
        disableClusteringAtZoom: 17,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: clusterIcon
    });
    map.addLayer(cluster);

    const container = map.getContainer();
    map.on('zoomend', () => container.classList.toggle('show-labels', map.getZoom() >= ZOOM_NOMS));
    map.on('click', closeMapCard);

    if (lieux.length) addMarkers();
    addLocateControl();
    setTimeout(() => map.invalidateSize(), 100);
}

function pinIcon(lieu, selected = false) {
    const couleur = FAMILLES[familleDuLieu(lieu, categories)].couleur;
    return L.divIcon({
        className: 'pin-icon',
        html: `<span class="pin${selected ? ' is-selected' : ''}" style="--fam:${couleur}"><span class="pin-dot"></span><span class="pin-label">${escapeHtml(lieu.nom)}</span></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });
}

// Regroupement : nombre de lieux, anneau aux couleurs des familles présentes
function clusterIcon(groupe) {
    const enfants = groupe.getAllChildMarkers();
    const parFamille = {};
    enfants.forEach(m => { parFamille[m.options.famille] = (parFamille[m.options.famille] || 0) + 1; });
    let angle = 0;
    const stops = Object.keys(FAMILLES).filter(f => parFamille[f]).map(f => {
        const debut = angle;
        angle += (parFamille[f] / enfants.length) * 360;
        return `${FAMILLES[f].couleur} ${debut}deg ${angle}deg`;
    });
    const n = enfants.length;
    const taille = n < 10 ? 34 : n < 25 ? 40 : 46;
    return L.divIcon({
        className: 'pin-cluster-icon',
        html: `<span class="pin-cluster" style="background:conic-gradient(${stops.join(',')})"><span>${n}</span></span>`,
        iconSize: [taille, taille]
    });
}

function addMarkers() {
    markers.clear();
    lieux.forEach(lieu => {
        if (lieu.latitude == null || lieu.longitude == null) return;
        const marker = L.marker([lieu.latitude, lieu.longitude], {
            icon: pinIcon(lieu, lieu.id === selectedId),
            title: lieu.nom,
            alt: lieu.nom,
            riseOnHover: true,
            famille: familleDuLieu(lieu, categories)
        });
        marker.on('click', () => selectLieu(lieu.id, { source: 'map' }));
        markers.set(lieu.id, marker);
    });
    applyFilterOnMap(filteredLieux());
    cadrer();
}

// Cadre la carte sur le cœur du quartier (les lieux excentrés restent accessibles)
function cadrer() {
    const points = [...markers.values()].map(m => m.getLatLng());
    if (points.length < 2) return;
    const pick = (values) => {
        const sorted = values.slice().sort((a, b) => a - b);
        const cut = Math.floor(sorted.length * 0.05);
        return [sorted[cut], sorted[sorted.length - 1 - cut]];
    };
    const [sud, nord] = pick(points.map(p => p.lat));
    const [ouest, est] = pick(points.map(p => p.lng));
    map.fitBounds([[sud, ouest], [nord, est]], { padding: [30, 30], maxZoom: 17 });
}

function applyFilterOnMap(items) {
    if (!cluster) return;
    cluster.clearLayers();
    cluster.addLayers(items.map(l => markers.get(l.id)).filter(Boolean));
}

// =====================
// Sélection d'un lieu (point, carte sans fiche, ?lieu=)
// =====================
function selectLieu(id, { source }) {
    const lieu = lieux.find(l => l.id === id);
    if (!lieu) return;

    // Lieu masqué par les filtres : on les efface pour le montrer
    if (!filteredLieux().some(l => l.id === id)) document.getElementById('resetFilters').click();

    if (selectedId && selectedId !== id) {
        const precedent = lieux.find(l => l.id === selectedId);
        if (precedent) markers.get(selectedId)?.setIcon(pinIcon(precedent));
    }
    selectedId = id;
    const marker = markers.get(id);

    document.querySelectorAll('.lieu-card.is-selected').forEach(c => c.classList.remove('is-selected'));
    const card = document.querySelector(`.lieu-card[data-id="${CSS.escape(id)}"]`);
    card?.classList.add('is-selected');

    if (marker && map) {
        marker.setIcon(pinIcon(lieu, true));
        if (source !== 'map') {
            cluster.zoomToShowLayer(marker, () => map.setView(marker.getLatLng(), Math.max(map.getZoom(), 17), { animate: true }));
        }
    }

    openMapCard(lieu);

    // Sur ordinateur, la carte de la liste vient sous les yeux
    if (source === 'map' && isWide() && card) {
        const r = card.getBoundingClientRect();
        const top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')) || 0;
        if (r.top < top || r.bottom > window.innerHeight) {
            window.scrollTo({ top: window.scrollY + r.top - top - 16, behavior: 'smooth' });
        }
    }
}

// =====================
// Panneau d'aperçu sur la carte
// =====================
function initMapCard() {
    const panel = document.getElementById('mapCard');
    panel.addEventListener('click', (e) => {
        if (e.target.closest('[data-fermer]')) closeMapCard();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMapCard();
    });
    // La carte ne doit pas réagir aux gestes faits dans le panneau
    if (typeof L !== 'undefined') {
        L.DomEvent.disableClickPropagation(panel);
        L.DomEvent.disableScrollPropagation(panel);
    }
}

function openMapCard(lieu) {
    const panel = document.getElementById('mapCard');
    const famille = familleDuLieu(lieu, categories);
    const cat = categories[(lieu.categories || [])[0]];
    const photo = photosDuLieu(lieu)[0];
    const desc = descriptionDuLieu(lieu, LANG);
    const infos = [adresseCourte(lieu.adresse), prixTexte(lieu.prix)].filter(Boolean).map(escapeHtml).join(' · ');

    panel.style.setProperty('--fam', FAMILLES[famille].couleur);
    panel.innerHTML = `
        <button type="button" class="map-card-close" data-fermer aria-label="${T.fermer}">${icone('fermer')}</button>
        <div class="map-card-media">
            ${photo ? `<img src="${escapeHtml(publicUrlFromPath(photo.vignette || photo.image))}" alt="">` : icone(famille, 'card-media-icon')}
        </div>
        <div class="map-card-body">
            <span class="map-card-label">${icone(famille)}${escapeHtml(nomCategorie(cat, LANG) || nomFamille(famille, LANG))}</span>
            <h2 class="map-card-title">${escapeHtml(lieu.nom)}</h2>
            ${desc.texte ? `<p class="map-card-desc" lang="${desc.lang}">${escapeHtml(desc.texte)}</p>` : ''}
            ${infos ? `<p class="map-card-meta">${infos}</p>` : ''}
            <div class="map-card-actions">
                ${aUneFiche(lieu) ? `<a class="btn-plein" href="${urlFiche(lieu.slug, LANG)}">${T.voirFiche}${icone('fleche')}</a>` : ''}
                <a class="btn-trait" href="${urlItineraire(lieu)}" target="_blank" rel="noopener noreferrer">${icone('itineraire')}${T.itineraire}</a>
            </div>
        </div>`;
    panel.hidden = false;
}

function closeMapCard() {
    const panel = document.getElementById('mapCard');
    if (panel.hidden) return;
    panel.hidden = true;
    if (selectedId) {
        const lieu = lieux.find(l => l.id === selectedId);
        if (lieu) markers.get(selectedId)?.setIcon(pinIcon(lieu));
        document.querySelectorAll('.lieu-card.is-selected').forEach(c => c.classList.remove('is-selected'));
        selectedId = null;
    }
}

// =====================
// Géolocalisation : "Me localiser" (une fois) + "Suivre en direct"
// =====================
function addLocateControl() {
    const LocateControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
            const container = L.DomUtil.create('div', 'locate-control');
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            locateOnceBtn = L.DomUtil.create('button', 'locate-btn locate-btn-once', container);
            locateOnceBtn.type = 'button';
            locateOnceBtn.title = CJ.t('lieux.locate.once');
            locateOnceBtn.setAttribute('aria-label', CJ.t('lieux.locate.once'));
            locateOnceBtn.innerHTML = `<span class="locate-btn-icon">${icone('viser')}</span><span class="locate-btn-label">${CJ.t('lieux.locate.once')}</span>`;
            L.DomEvent.on(locateOnceBtn, 'click', locateOnce);

            locateLiveBtn = L.DomUtil.create('button', 'locate-btn locate-btn-live', container);
            locateLiveBtn.type = 'button';
            locateLiveBtn.title = CJ.t('lieux.locate.liveAria');
            locateLiveBtn.setAttribute('aria-label', CJ.t('lieux.locate.liveAria'));
            locateLiveBtn.innerHTML = `<span class="locate-btn-icon">${icone('suivre')}</span><span class="locate-btn-label">${CJ.t('lieux.locate.live')}</span>`;
            L.DomEvent.on(locateLiveBtn, 'click', toggleLiveTracking);

            return container;
        }
    });

    map.addControl(new LocateControl());
    map.on('locationfound', onLocationFound);
    map.on('locationerror', onLocationError);
}

function setLiveButton(actif) {
    locateLiveBtn.querySelector('.locate-btn-icon').innerHTML = icone(actif ? 'stop' : 'suivre');
    locateLiveBtn.querySelector('.locate-btn-label').textContent = CJ.t(actif ? 'lieux.locate.stop' : 'lieux.locate.live');
}

function locateOnce() {
    if (locateBusy || liveWatching) return;
    locateBusy = true;
    pendingLocateMode = 'once';
    locateOnceBtn.classList.add('is-loading');
    locateOnceBtn.disabled = true;
    map.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true, timeout: 10000 });
}

function toggleLiveTracking() {
    if (liveWatching) {
        stopLiveTracking();
        return;
    }
    if (locateBusy) return;

    locateBusy = true;
    liveWatching = true;
    liveFirstFix = true;
    pendingLocateMode = 'live';
    locateLiveBtn.classList.add('is-loading');
    locateOnceBtn.disabled = true; // évite un conflit avec le suivi en cours

    map.locate({ watch: true, enableHighAccuracy: true, setView: false, maxZoom: 17, timeout: 15000 });
}

function stopLiveTracking() {
    map.stopLocate();
    liveWatching = false;
    liveFirstFix = false;
    locateBusy = false;
    pendingLocateMode = null;

    locateLiveBtn.classList.remove('is-loading', 'is-active');
    setLiveButton(false);
    locateOnceBtn.disabled = false;

    const el = userMarker && userMarker.getElement();
    if (el) el.classList.remove('user-marker-live');
}

function onLocationFound(e) {
    updateUserMarker(e.latlng, e.accuracy);

    if (pendingLocateMode === 'once') {
        locateBusy = false;
        pendingLocateMode = null;
        locateOnceBtn.classList.remove('is-loading');
        locateOnceBtn.disabled = false;
    } else if (pendingLocateMode === 'live' && liveFirstFix) {
        liveFirstFix = false;
        locateBusy = false;
        locateLiveBtn.classList.remove('is-loading');
        locateLiveBtn.classList.add('is-active');
        setLiveButton(true);
        map.setView(e.latlng, Math.max(map.getZoom(), 17), { animate: true });
    }
}

function onLocationError(e) {
    const wasOnce = pendingLocateMode === 'once';
    locateBusy = false;

    if (wasOnce) {
        pendingLocateMode = null;
        locateOnceBtn.classList.remove('is-loading');
        locateOnceBtn.disabled = false;
    }

    const messages = { 1: 'lieux.locate.refusee', 2: 'lieux.locate.indisponible', 3: 'lieux.locate.delai' };
    const message = CJ.t(messages[e.code] || 'lieux.locate.impossible');

    // Le suivi persiste tant que possible (le navigateur peut réessayer),
    // sauf refus explicite, qui ne se résoudra pas tout seul.
    if (liveWatching && e.code === 1) stopLiveTracking();

    showLocationErrorToast(message);
}

function updateUserMarker(latlng, accuracy) {
    if (!userMarker) {
        const icon = L.divIcon({
            className: 'user-location-marker',
            html: '<span class="user-location-dot"></span>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });
        userMarker = L.marker(latlng, { icon, zIndexOffset: 1000, keyboard: false, interactive: false }).addTo(map);
        userAccuracyCircle = L.circle(latlng, {
            radius: accuracy,
            color: '#3b82f6',
            weight: 1,
            fillColor: '#3b82f6',
            fillOpacity: 0.12,
            interactive: false
        }).addTo(map);
    } else {
        userMarker.setLatLng(latlng);
        userAccuracyCircle.setLatLng(latlng);
        userAccuracyCircle.setRadius(accuracy);
    }

    const el = userMarker.getElement();
    if (el) el.classList.toggle('user-marker-live', liveWatching);
}

// =====================
// Toast (retours géolocalisation)
// =====================
let toastTimer = null;
function showToast(message, type = 'info') {
    let el = document.getElementById('lieuxToast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'lieuxToast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'lieux-toast is-visible' + (type ? ' ' + type : '');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 4500);
}

function showLocationErrorToast(message) {
    const now = Date.now();
    if (now - lastLocationErrorToastAt < 6000) return; // pas de rafale pendant le suivi live
    lastLocationErrorToastAt = now;
    showToast(message, 'error');
}

// Coupe le suivi GPS si l'utilisateur quitte la page (batterie)
window.addEventListener('pagehide', () => {
    if (liveWatching) stopLiveTracking();
});
