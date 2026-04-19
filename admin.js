// =====================
// Imports Firebase
// =====================
import { db, auth } from './firebase-config.js';
import {
    collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
    signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// =====================
// État global
// =====================
let lieux = [];              // [{id, nom, categories, ...}]
let categories = {};         // {cle: {nom, couleur, icon}}
let currentTab = 'lieux';
let miniMap = null;
let miniMapMarker = null;
let pendingDelete = null;    // {type, id, nom} lors de la confirmation

// =====================
// Références DOM
// =====================
const loginScreen = document.getElementById('loginScreen');
const adminApp = document.getElementById('adminApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const userEmailEl = document.getElementById('userEmail');

// =====================
// Auth : flux de connexion
// =====================
onAuthStateChanged(auth, async (user) => {
    console.log('[AUTH] onAuthStateChanged déclenché. User:', user ? user.email : 'null');

    if (user) {
        console.log('[AUTH] Utilisateur connecté, bascule vers admin app');
        loginScreen.hidden = true;
        adminApp.hidden = false;
        userEmailEl.textContent = user.email;

        try {
            console.log('[DATA] Chargement des données...');
            await chargerToutesLesDonnees();
            console.log('[DATA] Lieux chargés:', lieux.length, '| Catégories chargées:', Object.keys(categories).length);

            console.log('[RENDER] Rendu des lieux...');
            renderLieux();
            console.log('[RENDER] Rendu des catégories...');
            renderCategories();
            console.log('[RENDER] Peuplement du filtre catégorie...');
            populateCategoryFilter();
            console.log('[RENDER] Terminé ✓');
        } catch (err) {
            console.error('[ERREUR] Après login:', err);
            toast('Erreur de chargement : ' + err.message, 'error');
        }
    } else {
        console.log('[AUTH] Aucun utilisateur, affichage du login');
        loginScreen.hidden = false;
        adminApp.hidden = true;
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Le listener onAuthStateChanged prendra le relais
    } catch (err) {
        console.error('Erreur de connexion:', err.code, err.message);
        loginError.hidden = false;
        loginError.textContent = traduireErreurAuth(err.code);
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut(auth);
});

function traduireErreurAuth(code) {
    const messages = {
        'auth/invalid-email': 'Email invalide',
        'auth/user-not-found': 'Utilisateur inconnu',
        'auth/wrong-password': 'Mot de passe incorrect',
        'auth/invalid-credential': 'Identifiants incorrects',
        'auth/invalid-login-credentials': 'Identifiants incorrects',
        'auth/user-disabled': 'Compte désactivé',
        'auth/too-many-requests': 'Trop de tentatives. Réessaie plus tard.',
        'auth/network-request-failed': 'Problème de connexion réseau'
    };
    return messages[code] || `Erreur de connexion (${code || 'inconnue'})`;
}

// =====================
// Chargement des données
// =====================
async function chargerToutesLesDonnees() {
    const [lieuxSnap, catSnap] = await Promise.all([
        getDocs(collection(db, 'lieux')),
        getDocs(collection(db, 'categories'))
    ]);

    lieux = lieuxSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    categories = {};
    catSnap.docs.forEach(d => { categories[d.id] = d.data(); });
}

// =====================
// Onglets
// =====================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        currentTab = tab;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.toggle('active', c.id === 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
        });
    });
});

// =====================
// Rendu : tableau des lieux
// =====================
const searchInput = document.getElementById('searchInput');
const filterCategory = document.getElementById('filterCategory');

searchInput.addEventListener('input', renderLieux);
filterCategory.addEventListener('change', renderLieux);

function populateCategoryFilter() {
    const select = filterCategory;
    // Vider sauf la première option
    select.innerHTML = '<option value="">Toutes les catégories</option>';

    Object.entries(categories)
        .sort((a, b) => a[1].nom.localeCompare(b[1].nom))
        .forEach(([cle, cat]) => {
            const opt = document.createElement('option');
            opt.value = cle;
            opt.textContent = `${cat.icon} ${cat.nom}`;
            select.appendChild(opt);
        });
}

function renderLieux() {
    const tbody = document.getElementById('lieuxTableBody');
    const countEl = document.getElementById('lieuxCount');

    const search = searchInput.value.trim().toLowerCase();
    const catFilter = filterCategory.value;

    const filtered = lieux.filter(l => {
        const matchSearch = !search || l.nom.toLowerCase().includes(search)
            || (l.description || '').toLowerCase().includes(search);
        const matchCat = !catFilter || (l.categories || []).includes(catFilter);
        return matchSearch && matchCat;
    }).sort((a, b) => a.nom.localeCompare(b.nom));

    countEl.textContent = `${filtered.length} lieu(x) affiché(s) sur ${lieux.length}`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Aucun lieu à afficher</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(l => {
        const badges = (l.categories || []).map(cle => {
            const cat = categories[cle];
            if (!cat) return `<span class="cat-badge" style="background:#95a5a6">${cle}</span>`;
            return `<span class="cat-badge" style="background:${cat.couleur}">${cat.icon} ${cat.nom}</span>`;
        }).join(' ');

        return `
            <tr>
                <td class="nom-cell">${escapeHtml(l.nom)}</td>
                <td>${badges}</td>
                <td class="desc-cell" title="${escapeHtml(l.description || '')}">${escapeHtml(l.description || '')}</td>
                <td>${l.instagram ? escapeHtml(l.instagram) : '—'}</td>
                <td class="actions">
                    <button class="btn btn-secondary btn-icon" data-action="edit-lieu" data-id="${l.id}">✏️ Éditer</button>
                    <button class="btn btn-danger btn-icon" data-action="delete-lieu" data-id="${l.id}">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

// =====================
// Rendu : tableau des catégories
// =====================
function renderCategories() {
    const tbody = document.getElementById('categoriesTableBody');

    const entries = Object.entries(categories).sort((a, b) => a[1].nom.localeCompare(b[1].nom));

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Aucune catégorie</td></tr>';
        return;
    }

    tbody.innerHTML = entries.map(([cle, cat]) => `
        <tr>
            <td><code>${escapeHtml(cle)}</code></td>
            <td class="nom-cell">${escapeHtml(cat.nom)}</td>
            <td style="font-size: 1.3rem">${escapeHtml(cat.icon)}</td>
            <td>
                <span class="color-swatch" style="background:${cat.couleur}"></span>
                <code>${escapeHtml(cat.couleur)}</code>
            </td>
            <td class="actions">
                <button class="btn btn-secondary btn-icon" data-action="edit-cat" data-id="${cle}">✏️ Éditer</button>
                <button class="btn btn-danger btn-icon" data-action="delete-cat" data-id="${cle}">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// =====================
// Délégation des actions (éditer/supprimer)
// =====================
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'edit-lieu') openLieuModal(id);
    else if (action === 'delete-lieu') confirmDeleteLieu(id);
    else if (action === 'edit-cat') openCategorieModal(id);
    else if (action === 'delete-cat') confirmDeleteCategorie(id);
});

// Boutons "Ajouter"
document.getElementById('addLieuBtn').addEventListener('click', () => openLieuModal(null));
document.getElementById('addCategorieBtn').addEventListener('click', () => openCategorieModal(null));

// =====================
// Modal LIEU : ouverture
// =====================
const lieuModal = document.getElementById('lieuModal');
const lieuForm = document.getElementById('lieuForm');
const lieuFormError = document.getElementById('lieuFormError');

function openLieuModal(lieuId) {
    lieuFormError.hidden = true;
    const isEdit = !!lieuId;
    const lieu = isEdit ? lieux.find(l => l.id === lieuId) : null;

    document.getElementById('lieuModalTitle').textContent = isEdit ? 'Modifier un lieu' : 'Ajouter un lieu';
    document.getElementById('lieuId').value = lieuId || '';
    document.getElementById('lieuNom').value = lieu?.nom || '';
    document.getElementById('lieuDescription').value = lieu?.description || '';
    document.getElementById('lieuImage').value = lieu?.image || '';
    document.getElementById('lieuInstagram').value = lieu?.instagram || '';

    // Coordonnées par défaut : centre du quartier
    const defaultLat = 43.29398;
    const defaultLng = 5.3843;
    const lat = lieu?.latitude ?? defaultLat;
    const lng = lieu?.longitude ?? defaultLng;
    document.getElementById('lieuLat').value = lat;
    document.getElementById('lieuLng').value = lng;

    // Cases à cocher pour les catégories
    const catContainer = document.getElementById('lieuCategories');
    const selectedCats = lieu?.categories || [];
    catContainer.innerHTML = Object.entries(categories)
        .sort((a, b) => a[1].nom.localeCompare(b[1].nom))
        .map(([cle, cat]) => `
            <label class="checkbox-label">
                <input type="checkbox" value="${cle}" ${selectedCats.includes(cle) ? 'checked' : ''}>
                <span>${cat.icon} ${cat.nom}</span>
            </label>
        `).join('');

    showModal(lieuModal);

    // Init de la mini-carte après affichage du modal
    setTimeout(() => initMiniMap(lat, lng), 50);
}

function initMiniMap(lat, lng) {
    const container = document.getElementById('lieuMiniMap');

    // Détruire la carte précédente si elle existe
    if (miniMap) {
        miniMap.remove();
        miniMap = null;
        miniMapMarker = null;
    }

    miniMap = L.map(container).setView([lat, lng], 16);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(miniMap);

    miniMapMarker = L.marker([lat, lng], { draggable: true }).addTo(miniMap);

    // Clic sur la carte -> déplace le marker
    miniMap.on('click', (e) => updateCoords(e.latlng.lat, e.latlng.lng));
    // Drag du marker
    miniMapMarker.on('dragend', (e) => {
        const p = e.target.getLatLng();
        updateCoords(p.lat, p.lng);
    });

    // Saisie manuelle synchrone avec la carte
    document.getElementById('lieuLat').addEventListener('change', syncFromInputs);
    document.getElementById('lieuLng').addEventListener('change', syncFromInputs);
}

function updateCoords(lat, lng) {
    document.getElementById('lieuLat').value = lat.toFixed(6);
    document.getElementById('lieuLng').value = lng.toFixed(6);
    if (miniMapMarker) miniMapMarker.setLatLng([lat, lng]);
}

function syncFromInputs() {
    const lat = parseFloat(document.getElementById('lieuLat').value);
    const lng = parseFloat(document.getElementById('lieuLng').value);
    if (!isNaN(lat) && !isNaN(lng) && miniMapMarker) {
        miniMapMarker.setLatLng([lat, lng]);
        miniMap.panTo([lat, lng]);
    }
}

// =====================
// Modal LIEU : soumission
// =====================
lieuForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    lieuFormError.hidden = true;

    const id = document.getElementById('lieuId').value;
    const isEdit = !!id;

    const selectedCats = Array.from(
        document.querySelectorAll('#lieuCategories input:checked')
    ).map(i => i.value);

    if (selectedCats.length === 0) {
        lieuFormError.hidden = false;
        lieuFormError.textContent = 'Sélectionne au moins une catégorie.';
        return;
    }

    const lat = parseFloat(document.getElementById('lieuLat').value);
    const lng = parseFloat(document.getElementById('lieuLng').value);
    if (isNaN(lat) || isNaN(lng)) {
        lieuFormError.hidden = false;
        lieuFormError.textContent = 'Coordonnées invalides.';
        return;
    }

    const data = {
        nom: document.getElementById('lieuNom').value.trim(),
        categories: selectedCats,
        latitude: lat,
        longitude: lng,
        description: document.getElementById('lieuDescription').value.trim(),
        image: document.getElementById('lieuImage').value.trim(),
        instagram: document.getElementById('lieuInstagram').value.trim() || null
    };

    const submitBtn = document.getElementById('lieuSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enregistrement...';

    try {
        if (isEdit) {
            await updateDoc(doc(db, 'lieux', id), data);
            const idx = lieux.findIndex(l => l.id === id);
            if (idx !== -1) lieux[idx] = { id, ...data };
            toast('Lieu modifié ✓', 'success');
        } else {
            const ref = await addDoc(collection(db, 'lieux'), data);
            lieux.push({ id: ref.id, ...data });
            toast('Lieu ajouté ✓', 'success');
        }
        renderLieux();
        closeAllModals();
    } catch (err) {
        console.error(err);
        lieuFormError.hidden = false;
        lieuFormError.textContent = 'Erreur : ' + err.message;
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enregistrer';
    }
});

// =====================
// Modal CATÉGORIE
// =====================
const categorieModal = document.getElementById('categorieModal');
const categorieForm = document.getElementById('categorieForm');
const categorieFormError = document.getElementById('categorieFormError');

function openCategorieModal(cle) {
    categorieFormError.hidden = true;
    const isEdit = !!cle;
    const cat = isEdit ? categories[cle] : null;

    document.getElementById('categorieModalTitle').textContent = isEdit ? 'Modifier une catégorie' : 'Ajouter une catégorie';
    const cleInput = document.getElementById('categorieCle');
    cleInput.value = cle || '';
    cleInput.readOnly = isEdit;  // clé non modifiable en édition

    document.getElementById('categorieNom').value = cat?.nom || '';
    document.getElementById('categorieIcon').value = cat?.icon || '';
    document.getElementById('categorieCouleur').value = cat?.couleur || '#ff4500';

    showModal(categorieModal);
}

categorieForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    categorieFormError.hidden = true;

    const cle = document.getElementById('categorieCle').value.trim().toLowerCase();
    const isEdit = !!categories[cle];

    if (!cle) {
        categorieFormError.hidden = false;
        categorieFormError.textContent = 'Clé obligatoire.';
        return;
    }

    const data = {
        nom: document.getElementById('categorieNom').value.trim(),
        icon: document.getElementById('categorieIcon').value.trim(),
        couleur: document.getElementById('categorieCouleur').value
    };

    try {
        await setDoc(doc(db, 'categories', cle), data);
        categories[cle] = data;
        renderCategories();
        populateCategoryFilter();
        renderLieux();  // pour mettre à jour les badges dans le tableau lieux
        toast(isEdit ? 'Catégorie modifiée ✓' : 'Catégorie ajoutée ✓', 'success');
        closeAllModals();
    } catch (err) {
        console.error(err);
        categorieFormError.hidden = false;
        categorieFormError.textContent = 'Erreur : ' + err.message;
    }
});

// =====================
// Suppressions avec confirmation
// =====================
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

function confirmDeleteLieu(id) {
    const lieu = lieux.find(l => l.id === id);
    if (!lieu) return;
    pendingDelete = { type: 'lieu', id, nom: lieu.nom };
    confirmMessage.textContent = `Supprimer le lieu "${lieu.nom}" ? Cette action est irréversible.`;
    showModal(confirmModal);
}

function confirmDeleteCategorie(cle) {
    // Vérifier si des lieux utilisent cette catégorie
    const usedBy = lieux.filter(l => (l.categories || []).includes(cle));
    if (usedBy.length > 0) {
        toast(`Impossible : ${usedBy.length} lieu(x) utilisent cette catégorie.`, 'error');
        return;
    }
    pendingDelete = { type: 'categorie', id: cle, nom: categories[cle]?.nom };
    confirmMessage.textContent = `Supprimer la catégorie "${categories[cle]?.nom}" ? Cette action est irréversible.`;
    showModal(confirmModal);
}

confirmDeleteBtn.addEventListener('click', async () => {
    if (!pendingDelete) return;
    confirmDeleteBtn.disabled = true;

    try {
        if (pendingDelete.type === 'lieu') {
            await deleteDoc(doc(db, 'lieux', pendingDelete.id));
            lieux = lieux.filter(l => l.id !== pendingDelete.id);
            renderLieux();
            toast('Lieu supprimé ✓', 'success');
        } else if (pendingDelete.type === 'categorie') {
            await deleteDoc(doc(db, 'categories', pendingDelete.id));
            delete categories[pendingDelete.id];
            renderCategories();
            populateCategoryFilter();
            toast('Catégorie supprimée ✓', 'success');
        }
        closeAllModals();
    } catch (err) {
        console.error(err);
        toast('Erreur : ' + err.message, 'error');
    } finally {
        confirmDeleteBtn.disabled = false;
        pendingDelete = null;
    }
});

// =====================
// Gestion générique des modals
// =====================
function showModal(modal) {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.hidden = true);
    document.body.style.overflow = '';
    // Nettoyer la mini-map pour libérer les ressources
    if (miniMap) {
        miniMap.remove();
        miniMap = null;
        miniMapMarker = null;
    }
}

document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close-modal]')) {
        closeAllModals();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
});

// =====================
// Toast notifications
// =====================
let toastTimer = null;
function toast(message, type = '') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast' + (type ? ' ' + type : '');
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

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
