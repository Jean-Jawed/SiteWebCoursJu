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
import {
    publicUrlFromPath, lieuPhotoUrl, uploadPhotoAndVignette, deleteFromStorage
} from './storage-helpers.js';

// =====================
// État global
// =====================
let lieux = [];              // [{id, nom, categories, ...}]
let categories = {};         // {cle: {nom, nom_en, couleur, icon}}
let currentTab = 'lieux';
let miniMap = null;
let miniMapMarker = null;
let pendingDelete = null;    // {type, id, nom} lors de la confirmation

// Fiche en cours d'édition :
//   original   → valeurs à l'ouverture (pour n'enregistrer que ce qui change)
//   photo      → null (inchangée) | {action: 'replace', file, previewUrl} | {action: 'remove'}
let edition = null;

// Tous les fichiers vivent sous "images/" dans le bucket
const STORAGE_DIR = 'images/';
const QUARTIER_CENTRE = { lat: 43.29398, lng: 5.3843 };

// Champs texte/nombre d'une fiche lieu, et leur libellé (pour les messages)
const CHAMPS_LIEU = {
    nom: 'nom',
    categories: 'catégories',
    instagram: 'Instagram',
    description: 'description FR',
    description_en: 'description EN',
    latitude: 'position',
    longitude: 'position'
};

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
    if (user) {
        loginScreen.hidden = true;
        adminApp.hidden = false;
        userEmailEl.textContent = user.email;

        try {
            await chargerToutesLesDonnees();
            renderLieux();
            renderCategories();
            populateCategoryFilter();
        } catch (err) {
            console.error('[ERREUR] Après login:', err);
            toast('Erreur de chargement : ' + err.message, 'error');
        }
    } else {
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

// Messages d'erreur Firebase compréhensibles
function messageErreur(err) {
    if (err?.code === 'permission-denied' || err?.code === 'storage/unauthorized') {
        return 'Accès refusé par les règles de sécurité Firebase (un nouveau champ n\'est peut-être pas autorisé).';
    }
    return err?.message || String(err);
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
const filterMissingEn = document.getElementById('filterMissingEn');

searchInput.addEventListener('input', renderLieux);
filterCategory.addEventListener('change', renderLieux);
filterMissingEn.addEventListener('change', renderLieux);

function populateCategoryFilter() {
    const select = filterCategory;
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
    const missingEn = filterMissingEn.checked;

    const filtered = lieux.filter(l => {
        const matchSearch = !search || l.nom.toLowerCase().includes(search)
            || (l.description || '').toLowerCase().includes(search)
            || (l.description_en || '').toLowerCase().includes(search);
        const matchCat = !catFilter || (l.categories || []).includes(catFilter);
        const matchEn = !missingEn || !(l.description_en || '').trim();
        return matchSearch && matchCat && matchEn;
    }).sort((a, b) => a.nom.localeCompare(b.nom));

    const sansEn = lieux.filter(l => !(l.description_en || '').trim()).length;
    countEl.textContent = `${filtered.length} lieu(x) affiché(s) sur ${lieux.length} · ${sansEn} sans description EN`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Aucun lieu à afficher</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(l => {
        const badges = (l.categories || []).map(cle => {
            const cat = categories[cle];
            if (!cat) return `<span class="cat-badge" style="background:#95a5a6">${escapeHtml(cle)}</span>`;
            return `<span class="cat-badge" style="background:${cat.couleur}">${cat.icon} ${escapeHtml(cat.nom)}</span>`;
        }).join(' ');
        const en = (l.description_en || '').trim();

        return `
            <tr>
                <td class="nom-cell">${escapeHtml(l.nom)}</td>
                <td>${badges}</td>
                <td class="desc-cell" title="${escapeHtml(l.description || '')}">${escapeHtml(l.description || '')}</td>
                <td class="status-cell" title="${escapeHtml(en)}">${en ? '<span class="status-ok">✓</span>' : '<span class="status-missing">—</span>'}</td>
                <td class="status-cell">${l.image ? (l.vignette ? '<span class="status-ok" title="Photo + vignette">✓</span>' : '<span class="status-ok" title="Photo sans vignette">✓<small>·</small></span>') : '<span class="status-missing">—</span>'}</td>
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
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Aucune catégorie</td></tr>';
        return;
    }

    tbody.innerHTML = entries.map(([cle, cat]) => `
        <tr>
            <td><code>${escapeHtml(cle)}</code></td>
            <td class="nom-cell">${escapeHtml(cat.nom)}</td>
            <td>${cat.nom_en ? escapeHtml(cat.nom_en) : '<span class="status-missing">—</span>'}</td>
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
// Fiche LIEU : valeurs normalisées
// =====================
const lieuModal = document.getElementById('lieuModal');
const lieuForm = document.getElementById('lieuForm');
const lieuFormError = document.getElementById('lieuFormError');
const photoSection = document.getElementById('lieuPhotoSection');
const positionSection = document.getElementById('lieuPositionSection');

const $ = (id) => document.getElementById(id);

// Arrondi des coordonnées (≈ 10 cm) : évite de « modifier » une position en la relisant
const arrondi = (n) => Math.round(n * 1e6) / 1e6;

// Valeurs d'une fiche telles qu'enregistrées dans Firestore
function valeursLieu(lieu) {
    return {
        nom: (lieu?.nom || '').trim(),
        categories: [...(lieu?.categories || [])],
        instagram: (lieu?.instagram || '').trim() || null,
        description: (lieu?.description || '').trim(),
        description_en: (lieu?.description_en || '').trim(),
        latitude: arrondi(lieu?.latitude ?? QUARTIER_CENTRE.lat),
        longitude: arrondi(lieu?.longitude ?? QUARTIER_CENTRE.lng)
    };
}

// Catégories cochées, en conservant l'ordre d'origine (la 1re est la principale) :
// celles déjà présentes gardent leur place, les nouvelles s'ajoutent à la fin.
function categoriesCochees() {
    const cochees = Array.from(document.querySelectorAll('#lieuCategories input:checked')).map(i => i.value);
    const origine = edition?.original.categories || [];
    const gardees = origine.filter(c => cochees.includes(c));
    const ajoutees = cochees.filter(c => !origine.includes(c));
    return [...gardees, ...ajoutees];
}

// Valeurs actuellement saisies dans le formulaire
function valeursFormulaire() {
    const lat = parseFloat($('lieuLat').value);
    const lng = parseFloat($('lieuLng').value);
    return {
        nom: $('lieuNom').value.trim(),
        categories: categoriesCochees(),
        instagram: $('lieuInstagram').value.trim() || null,
        description: $('lieuDescription').value.trim(),
        description_en: $('lieuDescriptionEn').value.trim(),
        latitude: isNaN(lat) ? NaN : arrondi(lat),
        longitude: isNaN(lng) ? NaN : arrondi(lng)
    };
}

// Champs qui diffèrent entre l'ouverture et maintenant
function champsModifies() {
    const avant = edition.original;
    const maintenant = valeursFormulaire();
    const changes = {};
    for (const cle of Object.keys(CHAMPS_LIEU)) {
        const a = avant[cle];
        const b = maintenant[cle];
        const egal = Array.isArray(a) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
        if (!egal) changes[cle] = b;
    }
    return changes;
}

function libellesModifies(changes) {
    const libelles = new Set(Object.keys(changes).map(c => CHAMPS_LIEU[c] || c));
    if (edition?.photo) libelles.add('photo');
    return [...libelles];
}

// =====================
// Fiche LIEU : ouverture
// =====================
function openLieuModal(lieuId) {
    lieuFormError.hidden = true;
    const isEdit = !!lieuId;
    const lieu = isEdit ? lieux.find(l => l.id === lieuId) : null;

    edition = {
        id: lieuId || null,
        original: valeursLieu(lieu),
        image: lieu?.image || '',
        vignette: lieu?.vignette || '',
        photo: null
    };

    $('lieuModalTitle').textContent = isEdit ? `Modifier « ${lieu.nom} »` : 'Ajouter un lieu';
    $('lieuId').value = lieuId || '';
    $('lieuNom').value = edition.original.nom;
    $('lieuInstagram').value = edition.original.instagram || '';
    $('lieuDescription').value = edition.original.description;
    $('lieuDescriptionEn').value = edition.original.description_en;
    $('lieuLat').value = edition.original.latitude;
    $('lieuLng').value = edition.original.longitude;
    $('lieuImageFile').value = '';

    // Cases à cocher (ordre alphabétique pour l'affichage)
    const selected = edition.original.categories;
    $('lieuCategories').innerHTML = Object.entries(categories)
        .sort((a, b) => a[1].nom.localeCompare(b[1].nom))
        .map(([cle, cat]) => `
            <label class="checkbox-label">
                <input type="checkbox" value="${cle}" ${selected.includes(cle) ? 'checked' : ''}>
                <span>${cat.icon} ${escapeHtml(cat.nom)}</span>
            </label>
        `).join('');

    // Blocs repliés en édition (rien n'est chargé tant qu'on ne les ouvre pas),
    // ouverts à la création (il faut une position, et souvent une photo)
    photoSection.open = !isEdit;
    positionSection.open = !isEdit;
    $('lieuImagePreview').dataset.loaded = '';

    refreshPhotoBlock();
    refreshPositionStatus();
    refreshDirtyState();
    showModal(lieuModal);

    if (photoSection.open) loadPhotoPreview();
    if (positionSection.open) ensureMiniMap();
}

// Le formulaire signale chaque modification (pour le résumé et le bouton)
lieuForm.addEventListener('input', () => { refreshDirtyState(); refreshPositionStatus(); });
lieuForm.addEventListener('change', () => { refreshDirtyState(); refreshPositionStatus(); });

function refreshDirtyState() {
    if (!edition) return;
    const submitBtn = $('lieuSubmitBtn');
    const summary = $('lieuDirtySummary');

    if (!edition.id) {
        summary.textContent = '';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Créer le lieu';
        return;
    }

    const libelles = libellesModifies(champsModifies());
    summary.textContent = libelles.length ? `Modifié : ${libelles.join(', ')}` : 'Aucune modification';
    submitBtn.disabled = libelles.length === 0;
    submitBtn.textContent = 'Enregistrer';
}

// =====================
// Fiche LIEU : bloc Photo
// =====================
photoSection.addEventListener('toggle', () => { if (photoSection.open) loadPhotoPreview(); });

// L'aperçu n'est chargé qu'à l'ouverture du bloc, et en vignette si possible
function loadPhotoPreview() {
    const box = $('lieuImagePreview');
    if (box.dataset.loaded === '1') return;
    box.dataset.loaded = '1';
    refreshPhotoBlock();
}

function refreshPhotoBlock() {
    const box = $('lieuImagePreview');
    const photo = edition?.photo;
    const hasStored = !!edition?.image;

    let src = null;
    if (photo?.action === 'replace') src = photo.previewUrl;
    else if (photo?.action !== 'remove' && hasStored && box.dataset.loaded === '1') {
        src = lieuPhotoUrl({ image: edition.image, vignette: edition.vignette }, 'vignette');
    }

    if (src) {
        box.classList.remove('image-preview-empty');
        box.innerHTML = `<img src="${escapeHtml(src)}" alt="Aperçu">`;
    } else {
        box.classList.add('image-preview-empty');
        const label = photo?.action === 'remove' ? '📷 Photo retirée (à l\'enregistrement)'
            : hasStored ? '📷 Ouvre ce bloc pour voir la photo' : '📷 Aucune photo';
        box.innerHTML = `<span class="image-preview-placeholder">${label}</span>`;
    }

    $('lieuImageRemoveBtn').hidden = !(hasStored && !photo);
    $('lieuImageUndoBtn').hidden = !photo;
    $('lieuImagePickBtn').textContent = hasStored || photo?.action === 'replace' ? '📁 Changer la photo…' : '📁 Choisir une photo…';

    const status = $('photoStatus');
    const path = $('lieuImagePath');
    if (photo?.action === 'replace') {
        status.textContent = '· nouvelle photo';
        path.textContent = `Sera enregistrée sous ${nouveauCheminPhoto()} (+ vignette)`;
    } else if (photo?.action === 'remove') {
        status.textContent = '· à retirer';
        path.textContent = '';
    } else if (hasStored) {
        status.textContent = edition.vignette ? '· ✓' : '· ✓ (sans vignette)';
        path.textContent = `Fichier : ${edition.image}`;
    } else {
        status.textContent = '· aucune';
        path.textContent = '';
    }
}

$('lieuImagePickBtn').addEventListener('click', () => $('lieuImageFile').click());

$('lieuImageFile').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        toast('Ce fichier n\'est pas une image.', 'error');
        e.target.value = '';
        return;
    }
    if (edition.photo?.previewUrl) URL.revokeObjectURL(edition.photo.previewUrl);
    edition.photo = { action: 'replace', file, previewUrl: URL.createObjectURL(file) };
    refreshPhotoBlock();
    refreshDirtyState();
});

$('lieuImageRemoveBtn').addEventListener('click', () => {
    edition.photo = { action: 'remove' };
    refreshPhotoBlock();
    refreshDirtyState();
});

$('lieuImageUndoBtn').addEventListener('click', () => {
    if (edition.photo?.previewUrl) URL.revokeObjectURL(edition.photo.previewUrl);
    edition.photo = null;
    $('lieuImageFile').value = '';
    refreshPhotoBlock();
    refreshDirtyState();
});

// Nom de fichier calculé : Catégorie_NomDuLieu_AAAAMMJJ-HHMM.jpg
// Le suffixe de date évite qu'un navigateur affiche l'ancienne photo (cache d'un an).
function nouveauCheminPhoto() {
    if (!edition.photo?.chemin) {
        const nom = $('lieuNom').value.trim();
        const firstCat = categoriesCochees()[0];
        const catName = firstCat && categories[firstCat] ? categories[firstCat].nom : 'Lieu';
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
        const chemin = `${STORAGE_DIR}${sanitizeFileSegment(catName)}_${sanitizeFileSegment(nom) || 'SansNom'}_${stamp}.jpg`;
        if (edition.photo) edition.photo.chemin = chemin;
        return chemin;
    }
    return edition.photo.chemin;
}

// Le nom suit le nom du lieu et la catégorie tant que la photo n'est pas envoyée
$('lieuNom').addEventListener('input', resetCheminPhoto);
$('lieuCategories').addEventListener('change', resetCheminPhoto);
function resetCheminPhoto() {
    if (edition?.photo?.action === 'replace') {
        edition.photo.chemin = null;
        refreshPhotoBlock();
    }
}

// Nettoie un segment pour usage dans un nom de fichier :
// "Le Champ de Mars" → "LeChampDeMars" (accents conservés, ponctuation retirée)
function sanitizeFileSegment(str) {
    if (!str) return '';
    return str
        .replace(/['’]/g, '')
        .replace(/[\s\-]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('')
        .replace(/[^\p{L}\p{N}_]/gu, '');
}

// =====================
// Fiche LIEU : bloc Position (carte chargée à l'ouverture du bloc)
// =====================
positionSection.addEventListener('toggle', () => {
    if (positionSection.open) ensureMiniMap();
});

// Une seule carte, créée une fois le bloc visible (Leaflet a besoin de sa taille)
function ensureMiniMap() {
    setTimeout(() => {
        if (positionSection.open && !miniMap && !lieuModal.hidden) initMiniMap();
    }, 50);
}

$('lieuLat').addEventListener('change', syncFromInputs);
$('lieuLng').addEventListener('change', syncFromInputs);

function initMiniMap() {
    if (miniMap) {
        miniMap.remove();
        miniMap = null;
        miniMapMarker = null;
    }
    const lat = parseFloat($('lieuLat').value) || QUARTIER_CENTRE.lat;
    const lng = parseFloat($('lieuLng').value) || QUARTIER_CENTRE.lng;

    miniMap = L.map('lieuMiniMap').setView([lat, lng], 16);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_49bf_1_6cd23bb70be548965ad61a75', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(miniMap);

    miniMapMarker = L.marker([lat, lng], { draggable: true }).addTo(miniMap);
    miniMap.on('click', (e) => updateCoords(e.latlng.lat, e.latlng.lng));
    miniMapMarker.on('dragend', (e) => {
        const p = e.target.getLatLng();
        updateCoords(p.lat, p.lng);
    });
}

function updateCoords(lat, lng) {
    $('lieuLat').value = lat.toFixed(6);
    $('lieuLng').value = lng.toFixed(6);
    if (miniMapMarker) miniMapMarker.setLatLng([lat, lng]);
    refreshDirtyState();
    refreshPositionStatus();
}

function syncFromInputs() {
    const lat = parseFloat($('lieuLat').value);
    const lng = parseFloat($('lieuLng').value);
    if (!isNaN(lat) && !isNaN(lng) && miniMapMarker) {
        miniMapMarker.setLatLng([lat, lng]);
        miniMap.panTo([lat, lng]);
    }
}

function refreshPositionStatus() {
    const lat = parseFloat($('lieuLat').value);
    const lng = parseFloat($('lieuLng').value);
    $('positionStatus').textContent = isNaN(lat) || isNaN(lng) ? '· à définir' : `· ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// =====================
// Fiche LIEU : enregistrement
// =====================
lieuForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    lieuFormError.hidden = true;

    const valeurs = valeursFormulaire();
    const erreur = validerLieu(valeurs);
    if (erreur) return afficherErreur(erreur);

    const submitBtn = $('lieuSubmitBtn');
    submitBtn.disabled = true;

    let envoye = null; // {image, vignette} : à supprimer si l'enregistrement échoue
    try {
        if (edition.id) {
            await enregistrerModifications(submitBtn, (paths) => { envoye = paths; });
        } else {
            await creerLieu(valeurs, submitBtn, (paths) => { envoye = paths; });
        }
        renderLieux();
        forceCloseModals();
    } catch (err) {
        console.error(err);
        if (err?.annule) {
            toast('Enregistrement annulé.', '');
        } else {
            afficherErreur('Erreur : ' + messageErreur(err));
        }
        // Rollback : la nouvelle photo envoyée n'est rattachée à aucune fiche
        if (envoye) {
            await deleteFromStorage(envoye.image);
            await deleteFromStorage(envoye.vignette);
        }
    } finally {
        submitBtn.disabled = false;
        refreshDirtyState();
    }
});

function validerLieu(v) {
    if (!v.nom) return 'Le nom est obligatoire.';
    if (v.categories.length === 0) return 'Sélectionne au moins une catégorie.';
    if (isNaN(v.latitude) || isNaN(v.longitude)) {
        positionSection.open = true;
        return 'Coordonnées invalides : ouvre le bloc Position.';
    }
    return null;
}

function afficherErreur(message) {
    lieuFormError.hidden = false;
    lieuFormError.textContent = message;
}

async function creerLieu(valeurs, submitBtn, onUpload) {
    const data = { ...valeurs };
    if (edition.photo?.action === 'replace') {
        submitBtn.textContent = 'Envoi de la photo…';
        const paths = await uploadPhotoAndVignette(edition.photo.file, nouveauCheminPhoto());
        onUpload(paths);
        Object.assign(data, paths);
    } else {
        data.image = '';
    }

    submitBtn.textContent = 'Enregistrement…';
    const ref = await addDoc(collection(db, 'lieux'), data);
    lieux.push({ id: ref.id, ...data });
    toast(`« ${data.nom} » ajouté ✓`, 'success');
}

// N'envoie que les champs modifiés ; la photo est traitée à part
async function enregistrerModifications(submitBtn, onUpload) {
    const changes = champsModifies();
    const libelles = libellesModifies(changes);
    if (libelles.length === 0) {
        toast('Aucune modification.', '');
        return;
    }

    // Quelqu'un a-t-il modifié les mêmes champs depuis l'ouverture de la fiche ?
    submitBtn.textContent = 'Vérification…';
    const snap = await getDoc(doc(db, 'lieux', edition.id));
    if (!snap.exists()) throw new Error('Cette fiche a été supprimée entre-temps.');
    const distant = valeursLieu(snap.data());
    const conflits = Object.keys(changes).filter(cle =>
        JSON.stringify(distant[cle]) !== JSON.stringify(edition.original[cle]));
    const photoDistante = snap.data().image || '';
    if (edition.photo && photoDistante !== edition.image) conflits.push('photo');
    if (conflits.length) {
        const noms = [...new Set(conflits.map(c => CHAMPS_LIEU[c] || c))].join(', ');
        if (!confirm(`Attention : ${noms} a été modifié par ailleurs depuis l'ouverture de cette fiche.\n\nÉcraser avec ta version ?`)) {
            throw Object.assign(new Error('annulé'), { annule: true });
        }
    }

    // Photo : nouvelle photo envoyée d'abord, ancienne supprimée seulement après succès
    const anciennes = { image: edition.image, vignette: edition.vignette };
    if (edition.photo?.action === 'replace') {
        submitBtn.textContent = 'Envoi de la photo…';
        const paths = await uploadPhotoAndVignette(edition.photo.file, nouveauCheminPhoto());
        onUpload(paths);
        Object.assign(changes, paths);
    } else if (edition.photo?.action === 'remove') {
        Object.assign(changes, { image: '', vignette: '' });
    }

    submitBtn.textContent = 'Enregistrement…';
    await updateDoc(doc(db, 'lieux', edition.id), changes);

    // Mise à jour locale, puis nettoyage des anciens fichiers
    const idx = lieux.findIndex(l => l.id === edition.id);
    if (idx !== -1) lieux[idx] = { ...lieux[idx], ...changes };
    if (edition.photo) {
        if (anciennes.image) await deleteFromStorage(anciennes.image);
        if (anciennes.vignette) await deleteFromStorage(anciennes.vignette);
    }

    toast(`Enregistré : ${libelles.join(', ')} ✓`, 'success');
}

// =====================
// Modal CATÉGORIE (n'envoie aussi que les champs modifiés)
// =====================
const categorieModal = document.getElementById('categorieModal');
const categorieForm = document.getElementById('categorieForm');
const categorieFormError = document.getElementById('categorieFormError');

function openCategorieModal(cle) {
    categorieFormError.hidden = true;
    const isEdit = !!cle;
    const cat = isEdit ? categories[cle] : null;

    $('categorieModalTitle').textContent = isEdit ? 'Modifier une catégorie' : 'Ajouter une catégorie';
    const cleInput = $('categorieCle');
    cleInput.value = cle || '';
    cleInput.readOnly = isEdit;  // clé non modifiable en édition

    $('categorieNom').value = cat?.nom || '';
    $('categorieNomEn').value = cat?.nom_en || '';
    $('categorieIcon').value = cat?.icon || '';
    $('categorieCouleur').value = cat?.couleur || '#ff4500';

    showModal(categorieModal);
}

categorieForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    categorieFormError.hidden = true;

    const cle = $('categorieCle').value.trim().toLowerCase();
    if (!cle) {
        categorieFormError.hidden = false;
        categorieFormError.textContent = 'Clé obligatoire.';
        return;
    }
    const isEdit = !!categories[cle];

    const data = {
        nom: $('categorieNom').value.trim(),
        nom_en: $('categorieNomEn').value.trim(),
        icon: $('categorieIcon').value.trim(),
        couleur: $('categorieCouleur').value
    };

    try {
        if (isEdit) {
            const avant = categories[cle];
            const changes = {};
            for (const [k, v] of Object.entries(data)) {
                if ((avant[k] || '') !== v) changes[k] = v;
            }
            if (Object.keys(changes).length === 0) {
                toast('Aucune modification.', '');
                forceCloseModals();
                return;
            }
            await updateDoc(doc(db, 'categories', cle), changes);
            categories[cle] = { ...avant, ...changes };
        } else {
            if (!data.nom_en) delete data.nom_en;
            await setDoc(doc(db, 'categories', cle), data);
            categories[cle] = data;
        }
        renderCategories();
        populateCategoryFilter();
        renderLieux();  // pour mettre à jour les badges dans le tableau lieux
        toast(isEdit ? 'Catégorie modifiée ✓' : 'Catégorie ajoutée ✓', 'success');
        forceCloseModals();
    } catch (err) {
        console.error(err);
        categorieFormError.hidden = false;
        categorieFormError.textContent = 'Erreur : ' + messageErreur(err);
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
    pendingDelete = { type: 'lieu', id, nom: lieu.nom, imagePath: lieu.image || '', vignettePath: lieu.vignette || '' };
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
            // Suppression best-effort de la photo et de sa vignette
            await deleteFromStorage(pendingDelete.imagePath);
            await deleteFromStorage(pendingDelete.vignettePath);
            toast('Lieu supprimé ✓', 'success');
        } else if (pendingDelete.type === 'categorie') {
            await deleteDoc(doc(db, 'categories', pendingDelete.id));
            delete categories[pendingDelete.id];
            renderCategories();
            populateCategoryFilter();
            toast('Catégorie supprimée ✓', 'success');
        }
        forceCloseModals();
    } catch (err) {
        console.error(err);
        toast('Erreur : ' + messageErreur(err), 'error');
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

// Fiche lieu ouverte avec des modifications non enregistrées ?
function hasUnsavedLieu() {
    if (lieuModal.hidden || !edition) return false;
    if (!edition.id) {
        const v = valeursFormulaire();
        return !!(v.nom || v.description || v.description_en || v.instagram || edition.photo);
    }
    return libellesModifies(champsModifies()).length > 0;
}

// Fermeture demandée par l'utilisateur (Annuler, croix, fond, Échap)
function closeAllModals() {
    if (hasUnsavedLieu() && !confirm('Fermer sans enregistrer les modifications ?')) return;
    forceCloseModals();
}

function forceCloseModals() {
    document.querySelectorAll('.modal').forEach(m => m.hidden = true);
    document.body.style.overflow = '';
    if (miniMap) {
        miniMap.remove();
        miniMap = null;
        miniMapMarker = null;
    }
    if (edition?.photo?.previewUrl) URL.revokeObjectURL(edition.photo.previewUrl);
    edition = null;
}

document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close-modal]')) {
        closeAllModals();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
});

// Quitter la page avec une fiche modifiée
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedLieu()) {
        e.preventDefault();
        e.returnValue = '';
    }
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
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
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
