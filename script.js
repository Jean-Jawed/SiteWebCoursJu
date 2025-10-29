// =====================
// Variables globales
// =====================
let map;
let markers = [];
let data = {};
let currentFilter = 'all';

// =====================
// Initialisation
// =====================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Charger les données
        const response = await fetch('data.json');
        data = await response.json();
        
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
        
    } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
    }
});

// =====================
// Initialisation de la carte
// =====================
function initMap() {
    // Centre de la carte sur le quartier
    const centerLat = 43.29398;
    const centerLng = 5.3843;
    
    map = L.map('map').setView([centerLat, centerLng], 16);
    
    // Utiliser un style de carte élégant
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
    const categoriesUtilisees = new Set(data.lieux.map(lieu => lieu.categorie));
    
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
}

// =====================
// Filtrage par catégorie
// =====================
function filterByCategory(category) {
    currentFilter = category;
    
    // Mettre à jour les boutons actifs
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Filtrer les markers
    markers.forEach(markerObj => {
        const shouldShow = category === 'all' || markerObj.category === category;
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
        const catInfo = data.categories[lieu.categorie];
        if (!catInfo) return;
        
        // Créer une icône HTML personnalisée
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${catInfo.couleur};">${catInfo.icon}</div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });
        
        // Créer le marker
        const marker = L.marker([lieu.latitude, lieu.longitude], { icon: icon });
        
        // Créer le contenu du popup
        const popupContent = createPopupContent(lieu, catInfo);
        
        // Bind popup avec options
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'custom-popup'
        });
        
        // Ajouter au tableau de markers
        markers.push({
            marker: marker,
            category: lieu.categorie,
            lieu: lieu
        });
        
        // Ajouter à la carte
        marker.addTo(map);
    });
}

// =====================
// Création du contenu du popup
// =====================
function createPopupContent(lieu, catInfo) {
    const instagramLink = lieu.instagram 
        ? `<a href="https://instagram.com/${lieu.instagram.replace('@', '')}" target="_blank" rel="noopener noreferrer" class="popup-instagram">
            📸 ${lieu.instagram}
           </a>`
        : '';
    
    return `
        <div class="popup-content">
            <img src="${lieu.image}" 
                 alt="${lieu.nom}" 
                 class="popup-image"
                 onclick="openLightbox('${lieu.image}', '${lieu.nom}')">
            <div class="popup-body">
                <h3 class="popup-title">${lieu.nom}</h3>
                <span class="popup-category" style="background-color: ${catInfo.couleur};">
                    ${catInfo.icon} ${catInfo.nom}
                </span>
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
    
    // Obtenir les catégories utilisées
    const categoriesUtilisees = new Set(data.lieux.map(lieu => lieu.categorie));
    
    // Trier les catégories
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
// Lightbox
// =====================
function openLightbox(imageSrc, caption) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxCaption = document.getElementById('lightboxCaption');
    
    lightboxImage.src = imageSrc;
    lightboxCaption.textContent = caption;
    lightbox.classList.add('active');
    
    // Empêcher le scroll du body
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
    
    // Réactiver le scroll du body
    document.body.style.overflow = '';
}

// Fermer avec la touche Échap
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLightbox();
    }
});

// =====================
// Scroll vers la carte
// =====================
function scrollToMap() {
    const mapSection = document.querySelector('.map-section');
    mapSection.scrollIntoView({ behavior: 'smooth' });
}

// =====================
// Fonction utilitaire pour ajouter facilement de nouveaux lieux
// =====================
// Cette fonction peut être utilisée dans la console pour tester l'ajout de lieux
function ajouterLieu(lieu) {
    // Ajouter le lieu aux données
    data.lieux.push(lieu);
    
    // Créer le marker
    const catInfo = data.categories[lieu.categorie];
    if (!catInfo) {
        console.error('Catégorie inconnue:', lieu.categorie);
        return;
    }
    
    const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: ${catInfo.couleur};">${catInfo.icon}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
    });
    
    const marker = L.marker([lieu.latitude, lieu.longitude], { icon: icon });
    const popupContent = createPopupContent(lieu, catInfo);
    marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'custom-popup'
    });
    
    markers.push({
        marker: marker,
        category: lieu.categorie,
        lieu: lieu
    });
    
    // Appliquer le filtre actuel
    if (currentFilter === 'all' || currentFilter === lieu.categorie) {
        marker.addTo(map);
    }
    
    console.log('Lieu ajouté avec succès:', lieu.nom);
}

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