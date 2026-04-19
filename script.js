// =====================
// Imports Firebase
// =====================
import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// =====================
// Variables globales
// =====================
let map;
let markers = [];
let data = { lieux: [], categories: {} };
let currentFilter = 'all';

// =====================
// Chargement des données depuis Firestore
// =====================
async function chargerDonnees() {
    // Chargement parallèle des deux collections
    const [lieuxSnap, categoriesSnap] = await Promise.all([
        getDocs(collection(db, 'lieux')),
        getDocs(collection(db, 'categories'))
    ]);

    // Lieux : tableau d'objets
    const lieux = lieuxSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    // Catégories : objet clé -> { nom, couleur, icon }
    const categories = {};
    categoriesSnap.docs.forEach(doc => {
        categories[doc.id] = doc.data();
    });

    return { lieux, categories };
}

// =====================
// Initialisation
// =====================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Charger les données depuis Firestore
        data = await chargerDonnees();

        // Initialiser la carte
        initMap();

        // Créer les filtres
        createFilters();

        // Créer la légende
        createLegend();

        // Ajouter tous les markers
        addMarkers(data.lieux);

        // Initialiser le toggle de la légende
        initLegendToggle();

        // Initialiser le toggle du header
        initHeaderToggle();

        // Initialiser les contrôles audio vidéo
        initVideoControls();

    } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
    }
});

// =====================
// Initialisation de la carte
// =====================
function initMap() {
    const centerLat = 43.29398;
    const centerLng = 5.3843;

    map = L.map('map').setView([centerLat, centerLng], 16);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
}

// =====================
// Création des filtres
// =====================
function createFilters() {
    const filtersContainer = document.getElementById('filters');

    // Obtenir toutes les catégories uniques des lieux existants
    const categoriesUtilisees = new Set();
    data.lieux.forEach(lieu => {
        lieu.categories.forEach(cat => categoriesUtilisees.add(cat));
    });

    // Trier les catégories alphabétiquement
    const categoriesTries = Array.from(categoriesUtilisees).sort((a, b) => {
        const nomA = data.categories[a]?.nom || a;
        const nomB = data.categories[b]?.nom || b;
        return nomA.localeCompare(nomB);
    });

    // Créer un bouton pour chaque catégorie utilisée
    categoriesTries.forEach(categorie => {
        const catInfo = data.categories[categorie];
        if (catInfo) {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.dataset.category = categorie;
            btn.innerHTML = `
                <span class="filter-icon">${catInfo.icon}</span>
                <span class="filter-label">${catInfo.nom}</span>
            `;
            btn.addEventListener('click', () => filterByCategory(categorie));
            filtersContainer.appendChild(btn);
        }
    });

    // Attacher l'event listener au bouton "Tout voir" existant
    const toutVoirBtn = document.querySelector('[data-category="all"]');
    if (toutVoirBtn) {
        toutVoirBtn.addEventListener('click', () => filterByCategory('all'));
    }
}

// =====================
// Filtrage par catégorie
// =====================
function filterByCategory(category) {
    currentFilter = category;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    markers.forEach(markerObj => {
        const shouldShow = category === 'all' || markerObj.categories.includes(category);
        if (shouldShow) {
            markerObj.marker.addTo(map);
        } else {
            map.removeLayer(markerObj.marker);
        }
    });
}

// =====================
// Ajout des markers
// =====================
function addMarkers(lieux) {
    lieux.forEach(lieu => {
        const primaryCategory = lieu.categories[0];
        const catInfo = data.categories[primaryCategory];
        if (!catInfo) return;

        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${catInfo.couleur};">${catInfo.icon}</div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });

        const marker = L.marker([lieu.latitude, lieu.longitude], { icon: icon });
        const popupContent = createPopupContent(lieu);

        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'custom-popup'
        });

        markers.push({
            marker: marker,
            categories: lieu.categories,
            lieu: lieu
        });

        marker.addTo(map);
    });
}

// =====================
// Création du contenu du popup
// =====================
function createPopupContent(lieu) {
    const instagramLink = lieu.instagram
        ? `<a href="https://instagram.com/${lieu.instagram.replace('@', '')}" target="_blank" rel="noopener noreferrer" class="popup-instagram">
            📸 ${lieu.instagram}
           </a>`
        : '';

    const categoryBadges = lieu.categories.map(cat => {
        const catInfo = data.categories[cat];
        if (!catInfo) return '';
        return `<span class="popup-category" style="background-color: ${catInfo.couleur};">
            ${catInfo.icon} ${catInfo.nom}
        </span>`;
    }).join(' ');

    return `
        <div class="popup-content">
            <img src="${lieu.image}"
                 alt="${lieu.nom}"
                 class="popup-image"
                 onclick="openLightbox('${lieu.image}', '${lieu.nom}')">
            <div class="popup-body">
                <h3 class="popup-title">${lieu.nom}</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.8rem;">
                    ${categoryBadges}
                </div>
                <p class="popup-description">${lieu.description}</p>
                ${instagramLink}
            </div>
        </div>
    `;
}

// =====================
// Création de la légende
// =====================
function createLegend() {
    const legendItems = document.getElementById('legendItems');

    const categoriesUtilisees = new Set();
    data.lieux.forEach(lieu => {
        lieu.categories.forEach(cat => categoriesUtilisees.add(cat));
    });

    const categoriesTries = Array.from(categoriesUtilisees).sort((a, b) => {
        const nomA = data.categories[a]?.nom || a;
        const nomB = data.categories[b]?.nom || b;
        return nomA.localeCompare(nomB);
    });

    categoriesTries.forEach(categorie => {
        const catInfo = data.categories[categorie];
        if (catInfo) {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
                <div class="legend-color" style="background-color: ${catInfo.couleur};">
                    ${catInfo.icon}
                </div>
                <span class="legend-label">${catInfo.nom}</span>
            `;
            legendItems.appendChild(item);
        }
    });
}

// =====================
// Toggle de la légende
// =====================
function initLegendToggle() {
    const toggle = document.getElementById('legendToggle');
    const content = document.getElementById('legendContent');

    toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        content.classList.toggle('open');
    });
}

// =====================
// Toggle du header
// =====================
function initHeaderToggle() {
    const header = document.getElementById('mainHeader');
    const toggleBtn = document.getElementById('headerToggle');

    const isCollapsed = localStorage.getItem('headerCollapsed') === 'true';
    if (isCollapsed) {
        header.classList.add('collapsed');
    }

    toggleBtn.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        const collapsed = header.classList.contains('collapsed');
        localStorage.setItem('headerCollapsed', collapsed);
    });
}

// =====================
// Contrôles audio vidéo hero
// =====================
function initVideoControls() {
    const video = document.querySelector('.hero-video');
    const volumeBtn = document.getElementById('volumeBtn');
    const volumeSlider = document.getElementById('volumeSlider');

    if (video && volumeBtn && volumeSlider) {
        volumeBtn.addEventListener('click', () => {
            if (video.muted) {
                video.muted = false;
                video.volume = volumeSlider.value / 100;
                volumeBtn.textContent = video.volume > 0.5 ? '🔊' : '🔉';
            } else {
                video.muted = true;
                volumeBtn.textContent = '🔇';
            }
        });

        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            video.volume = volume;
            video.muted = false;

            if (volume === 0) {
                volumeBtn.textContent = '🔇';
            } else if (volume > 0.5) {
                volumeBtn.textContent = '🔊';
            } else {
                volumeBtn.textContent = '🔉';
            }
        });
    }
}

// =====================
// Lightbox (exposée globalement car appelée depuis onclick inline)
// =====================
window.openLightbox = function (imageSrc, caption) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxCaption = document.getElementById('lightboxCaption');

    lightboxImage.src = imageSrc;
    lightboxCaption.textContent = caption;
    lightbox.classList.add('active');

    document.body.style.overflow = 'hidden';
};

window.closeLightbox = function () {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeLightbox();
    }
});

// =====================
// Scroll vers la carte (exposée globalement)
// =====================
window.scrollToMap = function () {
    const mapSection = document.querySelector('.map-section');
    mapSection.scrollIntoView({ behavior: 'smooth' });
};

// =====================
// Animation d'entrée des filtres
// =====================
window.addEventListener('load', () => {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach((btn, index) => {
        setTimeout(() => {
            btn.style.animation = 'fadeInUp 0.5s ease-out forwards';
        }, index * 50);
    });
});
