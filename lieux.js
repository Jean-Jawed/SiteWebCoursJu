// =====================
// lieux.js — Page Lieux : vue Liste + vue Carte + filtres partagés
// =====================

import { chargerDonnees } from './data-loader.js';
import { publicUrlFromPath } from './storage-helpers.js';

// =====================
// État global
// =====================
let lieux = [];
let categories = {};
let currentFilter = 'all';
let currentView = 'list';     // 'list' | 'map'

// Carte Leaflet (initialisée à la demande)
let map = null;
let markers = [];
let mapInitialized = false;

// =====================
// Initialisation
// =====================
document.addEventListener('DOMContentLoaded', async () => {
    initNavBurger();
    initViewToggle();

    try {
        ({ lieux, categories } = await chargerDonnees());
        createFilters();
        renderList();
    } catch (err) {
        console.error('Erreur chargement données:', err);
        document.getElementById('cardsGrid').innerHTML =
            '<p class="list-empty">Impossible de charger les lieux. Réessaie plus tard.</p>';
    }
});

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

// =====================
// Toggle Liste / Carte
// =====================
function initViewToggle() {
    document.getElementById('viewListBtn').addEventListener('click', () => switchView('list'));
    document.getElementById('viewMapBtn').addEventListener('click', () => switchView('map'));
}

function switchView(view) {
    if (view === currentView) return;
    currentView = view;

    const listBtn = document.getElementById('viewListBtn');
    const mapBtn = document.getElementById('viewMapBtn');
    const listSection = document.getElementById('viewList');
    const mapSection = document.getElementById('viewMap');

    if (view === 'list') {
        listBtn.classList.add('active');
        listBtn.setAttribute('aria-selected', 'true');
        mapBtn.classList.remove('active');
        mapBtn.setAttribute('aria-selected', 'false');
        listSection.hidden = false;
        mapSection.hidden = true;
    } else {
        mapBtn.classList.add('active');
        mapBtn.setAttribute('aria-selected', 'true');
        listBtn.classList.remove('active');
        listBtn.setAttribute('aria-selected', 'false');
        listSection.hidden = true;
        mapSection.hidden = false;

        // Init paresseuse de la carte au premier passage
        if (!mapInitialized) {
            initMap();
            mapInitialized = true;
        } else {
            // Leaflet a besoin qu'on lui signale un changement de taille
            // car la carte était hidden
            setTimeout(() => map.invalidateSize(), 50);
        }
    }
}

// =====================
// Filtres (partagés entre les deux vues)
// =====================
function createFilters() {
    const container = document.getElementById('filters');

    // Liste des catégories utilisées, triées
    const used = new Set();
    lieux.forEach(l => (l.categories || []).forEach(c => used.add(c)));
    const sorted = Array.from(used).sort((a, b) => {
        const na = categories[a]?.nom || a;
        const nb = categories[b]?.nom || b;
        return na.localeCompare(nb);
    });

    sorted.forEach(cle => {
        const cat = categories[cle];
        if (!cat) return;
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.category = cle;
        btn.innerHTML = `
            <span class="filter-icon">${cat.icon}</span>
            <span class="filter-label">${cat.nom}</span>
        `;
        btn.addEventListener('click', () => setFilter(cle));
        container.appendChild(btn);
    });

    // "Tout" existant déjà dans le HTML
    const allBtn = container.querySelector('[data-category="all"]');
    if (allBtn) allBtn.addEventListener('click', () => setFilter('all'));
}

function setFilter(category) {
    currentFilter = category;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });

    // Rafraîchir la vue courante
    if (currentView === 'list') {
        renderList();
    } else {
        applyFilterOnMap();
    }
}

function filteredLieux() {
    if (currentFilter === 'all') return lieux;
    return lieux.filter(l => (l.categories || []).includes(currentFilter));
}

// =====================
// Vue LISTE : rendu des cards
// =====================
function renderList() {
    const grid = document.getElementById('cardsGrid');
    const empty = document.getElementById('listEmpty');
    const count = document.getElementById('listCount');

    const items = filteredLieux().sort((a, b) => a.nom.localeCompare(b.nom));

    count.textContent = `${items.length} lieu${items.length > 1 ? 'x' : ''}`;

    if (items.length === 0) {
        grid.innerHTML = '';
        empty.hidden = false;
        return;
    }
    empty.hidden = true;

    grid.innerHTML = items.map(l => cardHTML(l)).join('');

    // Attacher les handlers aux boutons "Voir sur la carte" et aux images
    grid.querySelectorAll('.card-map-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const id = btn.dataset.id;
            goToLieuOnMap(id);
        });
    });

    grid.querySelectorAll('.card-image').forEach(img => {
        img.addEventListener('click', () => {
            openLightbox(img.dataset.src, img.dataset.caption);
        });
    });
}

function cardHTML(lieu) {
    const badges = (lieu.categories || []).map(cle => {
        const cat = categories[cle];
        if (!cat) return '';
        return `<span class="card-badge" style="background:${cat.couleur}">${cat.icon} ${escapeHtml(cat.nom)}</span>`;
    }).join('');

    const instagram = lieu.instagram
        ? `<a href="https://instagram.com/${lieu.instagram.replace('@', '')}" target="_blank" rel="noopener noreferrer" class="card-instagram">
             📸 ${escapeHtml(lieu.instagram)}
           </a>`
        : '';

    const imageUrl = publicUrlFromPath(lieu.image);
    const image = imageUrl
        ? `<img src="${escapeAttr(imageUrl)}"
                alt="${escapeAttr(lieu.nom)}"
                class="card-image"
                data-src="${escapeAttr(imageUrl)}"
                data-caption="${escapeAttr(lieu.nom)}"
                loading="lazy">`
        : '<div class="card-image card-image-placeholder">📍</div>';

    return `
        <article class="lieu-card">
            ${image}
            <div class="card-body">
                <h3 class="card-title">${escapeHtml(lieu.nom)}</h3>
                <div class="card-badges">${badges}</div>
                <p class="card-description">${escapeHtml(lieu.description || '')}</p>
                <div class="card-actions">
                    ${instagram}
                    <button class="card-map-link" data-id="${lieu.id}" aria-label="Voir sur la carte">
                        🗺️ Voir sur la carte
                    </button>
                </div>
            </div>
        </article>
    `;
}

// =====================
// Vue CARTE : initialisation
// =====================
function initMap() {
    const centerLat = 43.29398;
    const centerLng = 5.3843;

    map = L.map('map', { gestureHandling: true }).setView([centerLat, centerLng], 16);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    addMarkers();
    applyFilterOnMap();

    // Firefox/Safari ont besoin d'un invalidateSize après l'affichage
    setTimeout(() => map.invalidateSize(), 100);
}

function addMarkers() {
    lieux.forEach(lieu => {
        const primary = (lieu.categories || [])[0];
        const cat = categories[primary];
        if (!cat) return;

        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${cat.couleur};">${cat.icon}</div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });

        const marker = L.marker([lieu.latitude, lieu.longitude], { icon });
        marker.bindPopup(popupHTML(lieu), { maxWidth: 500, className: 'custom-popup', autoPan: false });

        markers.push({ id: lieu.id, marker, categories: lieu.categories || [], lieu });
    });
}

function popupHTML(lieu) {
    const instagram = lieu.instagram
        ? `<a href="https://instagram.com/${lieu.instagram.replace('@', '')}" target="_blank" rel="noopener noreferrer" class="popup-instagram">
             📸 ${escapeHtml(lieu.instagram)}
           </a>`
        : '';

    const badges = (lieu.categories || []).map(cle => {
        const cat = categories[cle];
        if (!cat) return '';
        return `<span class="popup-category" style="background-color: ${cat.couleur};">${cat.icon} ${escapeHtml(cat.nom)}</span>`;
    }).join(' ');

    const imageUrl = publicUrlFromPath(lieu.image);
    const image = imageUrl
        ? `<img src="${escapeAttr(imageUrl)}"
                alt="${escapeAttr(lieu.nom)}"
                class="popup-image"
                onclick="openLightbox('${escapeAttr(imageUrl)}', '${escapeAttr(lieu.nom)}')">`
        : '<div class="popup-image card-image-placeholder">📍</div>';

    return `
        <div class="popup-content">
            ${image}
            <div class="popup-body">
                <h3 class="popup-title">${escapeHtml(lieu.nom)}</h3>
                <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.8rem;">
                    ${badges}
                </div>
                <p class="popup-description">${escapeHtml(lieu.description || '')}</p>
                ${instagram}
            </div>
        </div>
    `;
}

function applyFilterOnMap() {
    if (!map) return;
    markers.forEach(m => {
        const visible = currentFilter === 'all' || m.categories.includes(currentFilter);
        if (visible) m.marker.addTo(map);
        else map.removeLayer(m.marker);
    });
}

// Appelé depuis le bouton "Voir sur la carte" d'une card
function goToLieuOnMap(id) {
    switchView('map');
    // petit délai pour laisser la carte se dimensionner
    setTimeout(() => {
        const m = markers.find(x => x.id === id);
        if (!m || !map) return;

        // S'il est filtré, on repasse sur "Tout" pour le montrer
        if (!m.marker._map) setFilter('all');

        map.setView(m.marker.getLatLng(), 18, { animate: true });
        m.marker.openPopup();
    }, 150);
}



// =====================
// Lightbox (exposée globalement, appelée depuis onclick inline des popups)
// =====================
window.openLightbox = function (src, caption) {
    if (!src) return;
    const lb = document.getElementById('lightbox');
    document.getElementById('lightboxImage').src = src;
    document.getElementById('lightboxCaption').textContent = caption || '';
    lb.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeLightbox = function () {
    const lb = document.getElementById('lightbox');
    lb.classList.remove('active');
    document.body.style.overflow = '';
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeLightbox();
});

// =====================
// Utilitaires
// =====================
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    if (str == null) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
