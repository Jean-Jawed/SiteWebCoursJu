// =====================
// Imports Firebase
// =====================
import { db, auth } from './firebase-config.js';
import {
    collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc,
    writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
    signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
    publicUrlFromPath, photosDuLieu, uploadPhotoAndVignette, deleteFromStorage
} from './storage-helpers.js';
import { FAMILLES, familleDe } from './lieux-commun.js';

// =====================
// État global
// =====================
let lieux = [];              // [{id, nom, categories, ...}]
let categories = {};         // {cle: {nom, nom_en, couleur, icon}}
let tags = {};               // {cle: {nom, nom_en, icon}}
let currentTab = 'lieux';
let miniMap = null;
let miniMapMarker = null;
let pendingDelete = null;    // {type, id, nom} lors de la confirmation
let lieuxAffiches = [];      // lieux du tableau après filtres (pour « tous » en édition groupée)

// Fiche en cours d'édition :
//   original       → valeurs à l'ouverture (pour n'enregistrer que ce qui change)
//   photosOrigine  → photos enregistrées à l'ouverture [{image, vignette}]
//   photos         → photos actuelles : enregistrées {image, vignette} ou nouvelles {file, previewUrl}
//   slugAuto       → le slug suit le nom tant qu'on ne l'a pas modifié à la main (création)
let edition = null;

// Édition groupée : null, ou {champ, changes: {idLieu: {champ: valeur}}}
let groupe = null;

// Tous les fichiers vivent sous "images/" dans le bucket
const STORAGE_DIR = 'images/';
const QUARTIER_CENTRE = { lat: 43.29398, lng: 5.3843 };
const SLUG_VALIDE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PRIX = { 1: '€', 2: '€€', 3: '€€€' };
const BATCH_MAX = 500; // écritures par batch Firestore

// Champs d'une fiche lieu, et leur libellé (pour les messages)
const CHAMPS_LIEU = {
    nom: 'nom',
    slug: 'slug',
    categories: 'catégories',
    publie: 'publication',
    coupDeCoeur: 'coup de cœur',
    prix: 'prix',
    tags: 'tags',
    adresse: 'adresse',
    site: 'site web',
    telephone: 'téléphone',
    instagram: 'Instagram',
    description: 'description FR',
    description_en: 'description EN',
    description_longue: 'description longue FR',
    description_longue_en: 'description longue EN',
    latitude: 'position',
    longitude: 'position'
};

// Catégories et tags partagent le même formulaire et le même tableau
const REFERENTIELS = {
    categorie: {
        collection: 'categories', champLieu: 'categories', couleur: true,
        libelle: 'catégorie', placeholder: 'ex: art, bars, restaurants'
    },
    tag: {
        collection: 'tags', champLieu: 'tags', couleur: false,
        libelle: 'tag', placeholder: 'ex: terrasse, concert'
    }
};
const referentiel = (type) => type === 'tag' ? tags : categories;

// =====================
// Références DOM
// =====================
const loginScreen = document.getElementById('loginScreen');
const adminApp = document.getElementById('adminApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const userEmailEl = document.getElementById('userEmail');

const $ = (id) => document.getElementById(id);

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
            renderReferentiel('categorie');
            renderReferentiel('tag');
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
        return 'Accès refusé par les règles de sécurité Firebase (session expirée ?).';
    }
    if (err?.name === 'InvalidStateError' || /decode/i.test(err?.message || '')) {
        return 'Une photo n\'a pas pu être lue (format non pris en charge par ce navigateur, ex. HEIC). Convertis-la en JPEG.';
    }
    return err?.message || String(err);
}

// =====================
// Chargement des données
// =====================
async function chargerToutesLesDonnees() {
    const [lieuxSnap, catSnap, tagsSnap] = await Promise.all([
        getDocs(collection(db, 'lieux')),
        getDocs(collection(db, 'categories')),
        getDocs(collection(db, 'tags'))
    ]);

    lieux = lieuxSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    categories = {};
    catSnap.docs.forEach(d => { categories[d.id] = d.data(); });
    tags = {};
    tagsSnap.docs.forEach(d => { tags[d.id] = d.data(); });
}

// Entrées d'un référentiel triées par nom : [[cle, {nom, ...}], ...]
const triParNom = (obj) => Object.entries(obj).sort((a, b) => (a[1].nom || '').localeCompare(b[1].nom || ''));

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
const filterUnpublished = document.getElementById('filterUnpublished');

searchInput.addEventListener('input', renderLieux);
filterCategory.addEventListener('change', renderLieux);
filterMissingEn.addEventListener('change', renderLieux);
filterUnpublished.addEventListener('change', renderLieux);

function populateCategoryFilter() {
    const select = filterCategory;
    const actuel = select.value;
    select.innerHTML = '<option value="">Toutes les catégories</option>';

    triParNom(categories).forEach(([cle, cat]) => {
        const opt = document.createElement('option');
        opt.value = cle;
        opt.textContent = `${cat.icon} ${cat.nom}`;
        select.appendChild(opt);
    });
    select.value = categories[actuel] ? actuel : '';
}

// Filtres appliqués aux valeurs enregistrées (en édition groupée, une ligne
// ne disparaît donc pas pendant qu'on la modifie)
function lieuxFiltres() {
    const search = searchInput.value.trim().toLowerCase();
    const catFilter = filterCategory.value;
    const missingEn = filterMissingEn.checked;
    const unpublished = filterUnpublished.checked;

    return lieux.filter(l => {
        const matchSearch = !search || l.nom.toLowerCase().includes(search)
            || (l.slug || '').includes(search)
            || (l.description || '').toLowerCase().includes(search)
            || (l.description_en || '').toLowerCase().includes(search);
        const matchCat = !catFilter || (l.categories || []).includes(catFilter);
        const matchEn = !missingEn || !(l.description_en || '').trim();
        const matchPublie = !unpublished || l.publie === false;
        return matchSearch && matchCat && matchEn && matchPublie;
    }).sort((a, b) => a.nom.localeCompare(b.nom));
}

function renderLieux() {
    const filtered = lieuxFiltres();
    lieuxAffiches = filtered;

    const sansEn = lieux.filter(l => !(l.description_en || '').trim()).length;
    const nonPublies = lieux.filter(l => l.publie === false).length;
    $('lieuxCount').textContent = `${filtered.length} lieu(x) affiché(s) sur ${lieux.length} · ${nonPublies} non publié(s) · ${sansEn} sans description EN`;

    if (groupe) renderTableGroupe(filtered);
    else renderTableNormale(filtered);
}

function badgesCategories(l) {
    return (l.categories || []).map(cle => {
        const cat = categories[cle];
        if (!cat) return `<span class="cat-badge" style="background:#95a5a6">${escapeHtml(cle)}</span>`;
        return `<span class="cat-badge" style="background:${cat.couleur}">${cat.icon} ${escapeHtml(cat.nom)}</span>`;
    }).join(' ');
}

function renderTableNormale(filtered) {
    $('lieuxTableHead').innerHTML = `
        <tr>
            <th title="Publié sur le site">En ligne</th>
            <th>Nom</th>
            <th>Catégories</th>
            <th>Description</th>
            <th title="Description anglaise">EN</th>
            <th title="Nombre de photos">Photos</th>
            <th>Prix</th>
            <th>Actions</th>
        </tr>`;

    const tbody = $('lieuxTableBody');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Aucun lieu à afficher</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(l => {
        const en = (l.description_en || '').trim();
        const photos = photosDuLieu(l);
        const sansVignette = photos.some(p => !p.vignette);
        const photosCell = photos.length
            ? `<span class="status-ok" title="${photos.length} photo(s)${sansVignette ? ', dont certaines sans vignette' : ''}">${photos.length}${sansVignette ? '<small>·</small>' : ''}</span>`
            : '<span class="status-missing">—</span>';
        const tagsIcones = (l.tags || []).filter(t => tags[t])
            .map(t => `<span title="${escapeHtml(tags[t].nom)}">${tags[t].icon}</span>`).join('');
        const publie = l.publie !== false;

        return `
            <tr class="${publie ? '' : 'row-off'}">
                <td class="status-cell">
                    <label class="switch" title="${publie ? 'Publié — cliquer pour retirer du site' : 'Non publié — cliquer pour publier'}">
                        <input type="checkbox" data-publie-id="${l.id}" ${publie ? 'checked' : ''}><span></span>
                    </label>
                </td>
                <td class="nom-cell">
                    ${escapeHtml(l.nom)}${l.coupDeCoeur ? ' <span title="Coup de cœur">❤️</span>' : ''}
                    ${tagsIcones ? `<div class="row-tags">${tagsIcones}</div>` : ''}
                </td>
                <td>${badgesCategories(l)}</td>
                <td class="desc-cell" title="${escapeHtml(l.description || '')}">${escapeHtml(l.description || '')}</td>
                <td class="status-cell" title="${escapeHtml(en)}">${en ? '<span class="status-ok">✓</span>' : '<span class="status-missing">—</span>'}</td>
                <td class="status-cell">${photosCell}</td>
                <td class="status-cell">${PRIX[l.prix] || '<span class="status-missing">—</span>'}</td>
                <td class="actions">
                    <button class="btn btn-secondary btn-icon" data-action="edit-lieu" data-id="${l.id}">✏️ Éditer</button>
                    <button class="btn btn-danger btn-icon" data-action="delete-lieu" data-id="${l.id}">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Interrupteur « En ligne » : enregistré immédiatement
$('lieuxTableBody').addEventListener('change', async (e) => {
    const input = e.target.closest('[data-publie-id]');
    if (!input) return;
    const lieu = lieux.find(l => l.id === input.dataset.publieId);
    if (!lieu) return;

    const publie = input.checked;
    input.disabled = true;
    try {
        await updateDoc(doc(db, 'lieux', lieu.id), { publie, modifieLe: serverTimestamp() });
        Object.assign(lieu, { publie, modifieLe: new Date() });
        toast(`« ${lieu.nom} » ${publie ? 'publié' : 'retiré du site'} ✓`, 'success');
    } catch (err) {
        console.error(err);
        input.checked = !publie;
        toast('Erreur : ' + messageErreur(err), 'error');
    } finally {
        input.disabled = false;
        renderLieux();
    }
});

// =====================
// Édition groupée
// =====================
$('bulkEditBtn').addEventListener('click', () => {
    groupe = { champ: 'prix', changes: {} };
    refreshBarreGroupe();
    renderLieux();
});

$('bulkCancelBtn').addEventListener('click', () => {
    const n = nbLieuxModifiesGroupe();
    if (n && !confirm(`Abandonner les modifications de ${n} lieu(x) ?`)) return;
    groupe = null;
    refreshBarreGroupe();
    renderLieux();
});

document.querySelectorAll('[data-bulk-champ]').forEach(btn => {
    btn.addEventListener('click', () => {
        groupe.champ = btn.dataset.bulkChamp;
        refreshBarreGroupe();
        renderLieux();
    });
});

function refreshBarreGroupe() {
    $('bulkBar').hidden = !groupe;
    $('lieuxActions').hidden = !!groupe;
    if (!groupe) return;
    document.querySelectorAll('[data-bulk-champ]').forEach(b =>
        b.classList.toggle('active', b.dataset.bulkChamp === groupe.champ));
    const n = nbLieuxModifiesGroupe();
    $('bulkCount').textContent = n ? `${n} lieu(x) modifié(s)` : 'Aucune modification';
    $('bulkSaveBtn').disabled = n === 0;
}

const nbLieuxModifiesGroupe = () => groupe ? Object.keys(groupe.changes).length : 0;

// Valeur affichée en édition groupée : la modification en attente, sinon la valeur enregistrée
function valeurGroupe(lieu, champ) {
    const attente = groupe?.changes[lieu.id];
    if (attente && champ in attente) return attente[champ];
    return valeursLieu(lieu)[champ];
}

function modifieGroupe(lieu, champ) {
    return !!groupe?.changes[lieu.id] && champ in groupe.changes[lieu.id];
}

// Une valeur revenue à l'identique n'est plus une modification
function setGroupe(lieu, champ, valeur) {
    const origine = valeursLieu(lieu)[champ];
    const changes = groupe.changes[lieu.id] || {};
    if (JSON.stringify(origine) === JSON.stringify(valeur)) delete changes[champ];
    else changes[champ] = valeur;
    if (Object.keys(changes).length) groupe.changes[lieu.id] = changes;
    else delete groupe.changes[lieu.id];
}

function basculerTag(lieu, cle, coche) {
    const actuels = valeurGroupe(lieu, 'tags').filter(t => t !== cle);
    setGroupe(lieu, 'tags', (coche ? [...actuels, cle] : actuels).sort());
}

function renderTableGroupe(filtered) {
    const champ = groupe.champ;
    const listeTags = triParNom(tags);
    const thTous = (cle, libelle) =>
        `<th class="th-center"><label class="th-check" title="Cocher / décocher pour tous les lieux affichés"><input type="checkbox" data-groupe-tous="${cle}">${libelle}</label></th>`;

    let entetes = '';
    if (champ === 'prix') entetes = '<th>Prix</th>';
    else if (champ === 'publie') entetes = thTous('publie', 'En ligne');
    else if (champ === 'coupDeCoeur') entetes = thTous('coupDeCoeur', '❤️ Coup de cœur');
    else if (champ === 'tags') entetes = listeTags.map(([cle, t]) => thTous(`tag:${cle}`, `${t.icon} ${escapeHtml(t.nom)}`)).join('');
    else if (champ === 'slug') entetes = '<th>Slug</th>';

    $('lieuxTableHead').innerHTML = `<tr><th>Nom</th><th>Catégories</th>${entetes}</tr>`;

    const tbody = $('lieuxTableBody');
    const nbColonnes = 2 + (champ === 'tags' ? listeTags.length : 1);
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${nbColonnes}" class="empty-state">Aucun lieu à afficher</td></tr>`;
        return;
    }

    const erreurs = champ === 'slug' ? erreursSlugs() : {};
    tbody.innerHTML = filtered.map(l => {
        const modifie = modifieGroupe(l, champ === 'tags' ? 'tags' : champ) ? 'cell-modified' : '';
        let cellules = '';

        if (champ === 'prix') {
            const prix = valeurGroupe(l, 'prix');
            const boutons = [['', '—'], ['1', '€'], ['2', '€€'], ['3', '€€€']].map(([v, txt]) =>
                `<button type="button" class="${String(prix ?? '') === v ? 'active' : ''}" data-groupe-prix="${v}" data-id="${l.id}">${txt}</button>`).join('');
            cellules = `<td class="${modifie}"><div class="prix-choix prix-choix-compact">${boutons}</div></td>`;
        } else if (champ === 'publie') {
            cellules = `<td class="th-center ${modifie}"><label class="switch"><input type="checkbox" data-groupe="publie" data-id="${l.id}" ${valeurGroupe(l, 'publie') ? 'checked' : ''}><span></span></label></td>`;
        } else if (champ === 'coupDeCoeur') {
            cellules = `<td class="th-center ${modifie}"><input type="checkbox" class="big-check" data-groupe="coupDeCoeur" data-id="${l.id}" ${valeurGroupe(l, 'coupDeCoeur') ? 'checked' : ''}></td>`;
        } else if (champ === 'tags') {
            const actuels = valeurGroupe(l, 'tags');
            const origine = valeursLieu(l).tags;
            cellules = listeTags.map(([cle]) => {
                const coche = actuels.includes(cle);
                const change = coche !== origine.includes(cle) ? 'cell-modified' : '';
                return `<td class="th-center ${change}"><input type="checkbox" class="big-check" data-groupe="tag:${cle}" data-id="${l.id}" ${coche ? 'checked' : ''}></td>`;
            }).join('');
        } else if (champ === 'slug') {
            const erreur = erreurs[l.id];
            cellules = `
                <td class="${modifie}">
                    <div class="input-with-btn">
                        <input type="text" class="slug-input ${erreur ? 'input-error' : ''}" data-groupe="slug" data-id="${l.id}"
                            value="${escapeHtml(valeurGroupe(l, 'slug'))}" title="${escapeHtml(erreur || '')}" spellcheck="false">
                        <button type="button" class="btn btn-secondary btn-icon" data-groupe-regen data-id="${l.id}" title="Recalculer à partir du nom">↺</button>
                    </div>
                </td>`;
        }

        return `<tr><td class="nom-cell">${escapeHtml(l.nom)}</td><td>${badgesCategories(l)}</td>${cellules}</tr>`;
    }).join('');

    // Cases « tous » : cochées si tous les lieux affichés le sont, à moitié sinon
    document.querySelectorAll('[data-groupe-tous]').forEach(input => {
        const cle = input.dataset.groupeTous;
        const valeurs = filtered.map(l => cle.startsWith('tag:')
            ? valeurGroupe(l, 'tags').includes(cle.slice(4))
            : !!valeurGroupe(l, cle));
        input.checked = valeurs.length > 0 && valeurs.every(Boolean);
        input.indeterminate = valeurs.some(Boolean) && !input.checked;
    });

    refreshBarreGroupe();
}

// Cases à cocher (une ligne ou « tous »)
$('lieuxTable').addEventListener('change', (e) => {
    if (!groupe) return;
    const input = e.target;

    if (input.dataset.groupeTous) {
        const cle = input.dataset.groupeTous;
        lieuxAffiches.forEach(l => {
            if (cle.startsWith('tag:')) basculerTag(l, cle.slice(4), input.checked);
            else setGroupe(l, cle, input.checked);
        });
        renderLieux();
        return;
    }

    const champ = input.dataset.groupe;
    if (!champ || input.type !== 'checkbox') return;
    const lieu = lieux.find(l => l.id === input.dataset.id);
    if (champ.startsWith('tag:')) basculerTag(lieu, champ.slice(4), input.checked);
    else setGroupe(lieu, champ, input.checked);
    renderLieux();
});

// Boutons de prix et recalcul du slug
$('lieuxTable').addEventListener('click', (e) => {
    if (!groupe) return;
    const prixBtn = e.target.closest('[data-groupe-prix]');
    const regenBtn = e.target.closest('[data-groupe-regen]');
    const btn = prixBtn || regenBtn;
    if (!btn) return;
    const lieu = lieux.find(l => l.id === btn.dataset.id);

    if (prixBtn) {
        const v = prixBtn.dataset.groupePrix;
        setGroupe(lieu, 'prix', v ? Number(v) : null);
    } else {
        setGroupe(lieu, 'slug', slugDisponible(slugify(lieu.nom), lieu.id, slugsGroupe()));
    }
    renderLieux();
});

// Saisie d'un slug : pas de re-rendu (le curseur serait perdu), juste la validation
$('lieuxTable').addEventListener('input', (e) => {
    if (!groupe || e.target.dataset.groupe !== 'slug') return;
    const lieu = lieux.find(l => l.id === e.target.dataset.id);
    setGroupe(lieu, 'slug', e.target.value.trim());
    e.target.closest('td').classList.toggle('cell-modified', modifieGroupe(lieu, 'slug'));

    const erreurs = erreursSlugs();
    document.querySelectorAll('.slug-input').forEach(input => {
        const erreur = erreurs[input.dataset.id];
        input.classList.toggle('input-error', !!erreur);
        input.title = erreur || '';
    });
    refreshBarreGroupe();
});

// Slugs de tous les lieux en tenant compte des modifications en attente : {id: slug}
function slugsGroupe() {
    const slugs = {};
    lieux.forEach(l => { slugs[l.id] = groupe ? valeurGroupe(l, 'slug') : valeursLieu(l).slug; });
    return slugs;
}

// Slugs vides, mal formés ou en double : {id: message}
function erreursSlugs() {
    const slugs = slugsGroupe();
    const compte = {};
    Object.values(slugs).forEach(s => { compte[s] = (compte[s] || 0) + 1; });
    const erreurs = {};
    for (const [id, s] of Object.entries(slugs)) {
        if (!s) erreurs[id] = 'Slug vide';
        else if (!SLUG_VALIDE.test(s)) erreurs[id] = 'Seulement minuscules sans accents, chiffres et tirets';
        else if (compte[s] > 1) erreurs[id] = 'Déjà utilisé par un autre lieu';
    }
    return erreurs;
}

$('bulkSaveBtn').addEventListener('click', async () => {
    const entrees = Object.entries(groupe.changes);
    if (!entrees.length) return;

    const erreurs = erreursSlugs();
    const fautifs = Object.keys(erreurs).filter(id => groupe.changes[id] && 'slug' in groupe.changes[id]);
    if (fautifs.length) {
        groupe.champ = 'slug';
        refreshBarreGroupe();
        renderLieux();
        toast(`${fautifs.length} slug(s) invalide(s) ou en double : corrige-les avant d'enregistrer.`, 'error');
        return;
    }

    const btn = $('bulkSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';
    try {
        for (let debut = 0; debut < entrees.length; debut += BATCH_MAX) {
            const batch = writeBatch(db);
            entrees.slice(debut, debut + BATCH_MAX).forEach(([id, changes]) => {
                batch.update(doc(db, 'lieux', id), { ...changes, modifieLe: serverTimestamp() });
            });
            await batch.commit();
        }
        const maintenant = new Date();
        entrees.forEach(([id, changes]) => {
            const lieu = lieux.find(l => l.id === id);
            if (lieu) Object.assign(lieu, changes, { modifieLe: maintenant });
        });
        groupe.changes = {};
        toast(`${entrees.length} lieu(x) enregistré(s) ✓`, 'success');
    } catch (err) {
        console.error(err);
        toast('Erreur : ' + messageErreur(err), 'error');
    } finally {
        btn.textContent = 'Enregistrer';
        renderLieux();
        renderReferentiel('tag');
    }
});

// =====================
// Rendu : tableaux des catégories et des tags
// =====================
function renderReferentiel(type) {
    const conf = REFERENTIELS[type];
    const tbody = document.getElementById(type === 'tag' ? 'tagsTableBody' : 'categoriesTableBody');
    const entries = triParNom(referentiel(type));

    if (entries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${conf.couleur ? 7 : 6}" class="empty-state">Aucun ${conf.libelle}</td></tr>`;
        return;
    }

    tbody.innerHTML = entries.map(([cle, item]) => {
        const derniereColonne = conf.couleur
            ? `<span class="color-swatch" style="background:${item.couleur}"></span><code>${escapeHtml(item.couleur)}</code>`
            : lieux.filter(l => (l[conf.champLieu] || []).includes(cle)).length;
        const famille = FAMILLES[familleDe(cle, item)];
        const colonneFamille = conf.couleur
            ? `<td><span class="color-swatch" style="background:${famille.couleur}"></span>${escapeHtml(famille.nom)}${item.famille ? '' : ' <small title="Famille par défaut : à confirmer en éditant la catégorie">·</small>'}</td>`
            : '';
        return `
        <tr>
            <td><code>${escapeHtml(cle)}</code></td>
            <td class="nom-cell">${escapeHtml(item.nom)}</td>
            <td>${item.nom_en ? escapeHtml(item.nom_en) : '<span class="status-missing">—</span>'}</td>
            <td style="font-size: 1.3rem">${escapeHtml(item.icon)}</td>
            ${colonneFamille}
            <td>${derniereColonne}</td>
            <td class="actions">
                <button class="btn btn-secondary btn-icon" data-action="edit-${type}" data-id="${cle}">✏️ Éditer</button>
                <button class="btn btn-danger btn-icon" data-action="delete-${type}" data-id="${cle}">🗑️</button>
            </td>
        </tr>
    `;
    }).join('');
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
    else if (action === 'edit-categorie') openReferentielModal('categorie', id);
    else if (action === 'delete-categorie') confirmDeleteReferentiel('categorie', id);
    else if (action === 'edit-tag') openReferentielModal('tag', id);
    else if (action === 'delete-tag') confirmDeleteReferentiel('tag', id);
});

// Boutons "Ajouter"
document.getElementById('addLieuBtn').addEventListener('click', () => openLieuModal(null));
document.getElementById('addCategorieBtn').addEventListener('click', () => openReferentielModal('categorie', null));
document.getElementById('addTagBtn').addEventListener('click', () => openReferentielModal('tag', null));

// =====================
// Fiche LIEU : valeurs normalisées
// =====================
const lieuModal = document.getElementById('lieuModal');
const lieuForm = document.getElementById('lieuForm');
const lieuFormError = document.getElementById('lieuFormError');
const photoSection = document.getElementById('lieuPhotoSection');
const positionSection = document.getElementById('lieuPositionSection');
const longueSection = document.getElementById('lieuLongueSection');

// Arrondi des coordonnées (≈ 10 cm) : évite de « modifier » une position en la relisant
const arrondi = (n) => Math.round(n * 1e6) / 1e6;

// Valeurs d'une fiche telles qu'enregistrées dans Firestore (hors photos)
function valeursLieu(lieu) {
    return {
        nom: (lieu?.nom || '').trim(),
        slug: (lieu?.slug || '').trim(),
        categories: [...(lieu?.categories || [])],
        publie: lieu ? lieu.publie !== false : true,
        coupDeCoeur: !!lieu?.coupDeCoeur,
        prix: PRIX[lieu?.prix] ? lieu.prix : null,
        tags: [...(lieu?.tags || [])].sort(),
        adresse: (lieu?.adresse || '').trim(),
        site: (lieu?.site || '').trim(),
        telephone: (lieu?.telephone || '').trim(),
        instagram: (lieu?.instagram || '').trim() || null,
        description: (lieu?.description || '').trim(),
        description_en: (lieu?.description_en || '').trim(),
        description_longue: (lieu?.description_longue || '').trim(),
        description_longue_en: (lieu?.description_longue_en || '').trim(),
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

// "monlieu.fr" → "https://monlieu.fr"
function normaliserUrl(url) {
    const u = url.trim();
    if (!u) return '';
    return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

// Valeurs actuellement saisies dans le formulaire
function valeursFormulaire() {
    const lat = parseFloat($('lieuLat').value);
    const lng = parseFloat($('lieuLng').value);
    const prix = document.querySelector('input[name="lieuPrix"]:checked')?.value;
    return {
        nom: $('lieuNom').value.trim(),
        slug: $('lieuSlug').value.trim(),
        categories: categoriesCochees(),
        publie: $('lieuPublie').checked,
        coupDeCoeur: $('lieuCoupDeCoeur').checked,
        prix: prix ? Number(prix) : null,
        tags: Array.from(document.querySelectorAll('#lieuTags input:checked')).map(i => i.value).sort(),
        adresse: $('lieuAdresse').value.trim(),
        site: normaliserUrl($('lieuSite').value),
        telephone: $('lieuTelephone').value.trim(),
        instagram: $('lieuInstagram').value.trim() || null,
        description: $('lieuDescription').value.trim(),
        description_en: $('lieuDescriptionEn').value.trim(),
        description_longue: $('lieuDescriptionLongue').value.trim(),
        description_longue_en: $('lieuDescriptionLongueEn').value.trim(),
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

// Les photos ont-elles changé (ajout, retrait, ordre) ?
const clePhotos = (photos) => JSON.stringify(photos.map(p => p.file ? '+' : p.image));
const photosModifiees = () => !!edition && clePhotos(edition.photos) !== clePhotos(edition.photosOrigine);

function libellesModifies(changes) {
    const libelles = new Set(Object.keys(changes).map(c => CHAMPS_LIEU[c] || c));
    if (photosModifiees()) libelles.add('photos');
    return [...libelles];
}

// =====================
// Slugs
// =====================
// "Café de l'Œuvre !" → "cafe-de-l-oeuvre" (même règle que scripts/migrer-lieux.py)
function slugify(texte) {
    return (texte || '')
        .replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').replace(/æ/g, 'ae')
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'lieu';
}

// Premier slug libre à partir de base : base, base-2, base-3…
function slugDisponible(base, idExclu, slugs = slugsGroupe()) {
    const pris = new Set(Object.entries(slugs).filter(([id]) => id !== idExclu).map(([, s]) => s));
    let slug = base;
    for (let n = 2; pris.has(slug); n++) slug = `${base}-${n}`;
    return slug;
}

// À la création, le slug suit le nom tant qu'on ne l'a pas modifié à la main
$('lieuNom').addEventListener('input', () => {
    if (edition?.slugAuto) $('lieuSlug').value = slugDisponible(slugify($('lieuNom').value), edition.id);
});
$('lieuSlug').addEventListener('input', () => { if (edition) edition.slugAuto = false; });
$('lieuSlugRegenBtn').addEventListener('click', () => {
    $('lieuSlug').value = slugDisponible(slugify($('lieuNom').value), edition.id);
    refreshDirtyState();
});

// =====================
// Fiche LIEU : ouverture
// =====================
function openLieuModal(lieuId) {
    lieuFormError.hidden = true;
    const isEdit = !!lieuId;
    const lieu = isEdit ? lieux.find(l => l.id === lieuId) : null;
    const photos = photosDuLieu(lieu);

    edition = {
        id: lieuId || null,
        original: valeursLieu(lieu),
        photosOrigine: photos,
        photos: [...photos],
        slugAuto: !isEdit
    };
    const v = edition.original;

    $('lieuModalTitle').textContent = isEdit ? `Modifier « ${lieu.nom} »` : 'Ajouter un lieu';
    $('lieuModalDates').textContent = isEdit
        ? [lieu.creeLe && `Créé le ${dateTexte(lieu.creeLe)}`, lieu.modifieLe && `modifié le ${dateTexte(lieu.modifieLe)}`].filter(Boolean).join(' · ')
        : '';
    $('lieuId').value = lieuId || '';
    $('lieuNom').value = v.nom;
    $('lieuSlug').value = v.slug;
    $('lieuPublie').checked = v.publie;
    $('lieuCoupDeCoeur').checked = v.coupDeCoeur;
    document.querySelectorAll('input[name="lieuPrix"]').forEach(r => { r.checked = r.value === String(v.prix ?? ''); });
    $('lieuAdresse').value = v.adresse;
    $('lieuSite').value = v.site;
    $('lieuTelephone').value = v.telephone;
    $('lieuInstagram').value = v.instagram || '';
    $('lieuDescription').value = v.description;
    $('lieuDescriptionEn').value = v.description_en;
    $('lieuDescriptionLongue').value = v.description_longue;
    $('lieuDescriptionLongueEn').value = v.description_longue_en;
    $('lieuLat').value = v.latitude;
    $('lieuLng').value = v.longitude;
    $('lieuImageFile').value = '';

    // Cases à cocher (ordre alphabétique pour l'affichage)
    $('lieuCategories').innerHTML = triParNom(categories).map(([cle, cat]) => `
            <label class="checkbox-label">
                <input type="checkbox" value="${cle}" ${v.categories.includes(cle) ? 'checked' : ''}>
                <span>${cat.icon} ${escapeHtml(cat.nom)}</span>
            </label>
        `).join('');
    $('lieuTags').innerHTML = triParNom(tags).map(([cle, tag]) => `
            <label class="checkbox-label">
                <input type="checkbox" value="${cle}" ${v.tags.includes(cle) ? 'checked' : ''}>
                <span>${tag.icon} ${escapeHtml(tag.nom)}</span>
            </label>
        `).join('') || '<small>Aucun tag : crée-les dans l\'onglet Tags.</small>';

    // Blocs repliés en édition (rien n'est chargé tant qu'on ne les ouvre pas),
    // ouverts à la création (il faut une position, et souvent une photo)
    photoSection.open = !isEdit;
    positionSection.open = !isEdit;
    longueSection.open = false;
    $('lieuPhotos').dataset.loaded = '';

    refreshPhotoBlock();
    refreshPositionStatus();
    refreshLongueStatus();
    refreshDirtyState();
    showModal(lieuModal);

    if (photoSection.open) loadPhotoPreview();
    if (positionSection.open) ensureMiniMap();
}

// Le formulaire signale chaque modification (pour le résumé et le bouton)
lieuForm.addEventListener('input', refreshFiche);
lieuForm.addEventListener('change', refreshFiche);
function refreshFiche() {
    refreshDirtyState();
    refreshPositionStatus();
    refreshLongueStatus();
}

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

function refreshLongueStatus() {
    const remplies = [$('lieuDescriptionLongue'), $('lieuDescriptionLongueEn')].filter(t => t.value.trim()).length;
    $('longueStatus').textContent = `· ${remplies}/2`;
}

// =====================
// Fiche LIEU : bloc Photos
// =====================
photoSection.addEventListener('toggle', () => { if (photoSection.open) loadPhotoPreview(); });

// Les miniatures ne sont chargées qu'à l'ouverture du bloc
function loadPhotoPreview() {
    const box = $('lieuPhotos');
    if (box.dataset.loaded === '1') return;
    box.dataset.loaded = '1';
    refreshPhotoBlock();
}

function refreshPhotoBlock() {
    const box = $('lieuPhotos');
    const photos = edition?.photos || [];
    const loaded = box.dataset.loaded === '1';

    if (photos.length === 0) {
        box.innerHTML = '<div class="image-preview image-preview-empty"><span class="image-preview-placeholder">📷 Aucune photo</span></div>';
    } else {
        box.innerHTML = photos.map((p, i) => {
            const src = p.file ? p.previewUrl : (loaded ? publicUrlFromPath(p.vignette || p.image) : null);
            const visuel = src
                ? `<img src="${escapeHtml(src)}" alt="Photo ${i + 1}" loading="lazy">`
                : '<span class="image-preview-placeholder">📷</span>';
            return `
                <figure class="photo-item ${p.file ? 'photo-new' : ''}">
                    <div class="image-preview">${visuel}</div>
                    ${i === 0 ? '<span class="photo-badge">Principale</span>' : ''}
                    ${p.file ? '<span class="photo-badge photo-badge-new">Nouvelle</span>' : ''}
                    <figcaption>
                        <button type="button" data-photo="gauche" data-index="${i}" title="Avancer" ${i === 0 ? 'disabled' : ''}>◀</button>
                        <button type="button" data-photo="principale" data-index="${i}" title="Mettre en photo principale" ${i === 0 ? 'disabled' : ''}>★</button>
                        <button type="button" data-photo="droite" data-index="${i}" title="Reculer" ${i === photos.length - 1 ? 'disabled' : ''}>▶</button>
                        <button type="button" data-photo="retirer" data-index="${i}" title="Retirer">✕</button>
                    </figcaption>
                </figure>`;
        }).join('');
    }

    const nouvelles = photos.filter(p => p.file).length;
    const retirees = edition ? edition.photosOrigine.filter(o => !photos.some(p => p.image === o.image)).length : 0;
    const details = [nouvelles && `${nouvelles} nouvelle(s)`, retirees && `${retirees} retirée(s)`].filter(Boolean);
    if (photosModifiees() && !details.length) details.push('ordre modifié');
    $('photoStatus').textContent = `· ${photos.length} photo(s)${details.length ? ' · ' + details.join(', ') : ''}`;
    $('lieuImageUndoBtn').hidden = !photosModifiees();
}

$('lieuPhotos').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-photo]');
    if (!btn) return;
    const photos = edition.photos;
    const i = Number(btn.dataset.index);

    if (btn.dataset.photo === 'gauche' && i > 0) {
        [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
    } else if (btn.dataset.photo === 'droite' && i < photos.length - 1) {
        [photos[i + 1], photos[i]] = [photos[i], photos[i + 1]];
    } else if (btn.dataset.photo === 'principale') {
        photos.unshift(...photos.splice(i, 1));
    } else if (btn.dataset.photo === 'retirer') {
        const [retiree] = photos.splice(i, 1);
        if (retiree.previewUrl) URL.revokeObjectURL(retiree.previewUrl);
    }
    refreshPhotoBlock();
    refreshDirtyState();
});

$('lieuImagePickBtn').addEventListener('click', () => $('lieuImageFile').click());

$('lieuImageFile').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    const refuses = files.filter(f => !f.type.startsWith('image/'));
    files.filter(f => f.type.startsWith('image/')).forEach(file => {
        edition.photos.push({ file, previewUrl: URL.createObjectURL(file) });
    });
    if (refuses.length) toast(`${refuses.length} fichier(s) ignoré(s) : ce ne sont pas des images.`, 'error');
    e.target.value = '';
    refreshPhotoBlock();
    refreshDirtyState();
});

$('lieuImageUndoBtn').addEventListener('click', () => {
    revoquerApercus();
    edition.photos = [...edition.photosOrigine];
    refreshPhotoBlock();
    refreshDirtyState();
});

function revoquerApercus() {
    (edition?.photos || []).forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
}

// Début du nom des nouvelles photos : images/Catégorie_NomDuLieu_AAAAMMJJ-HHMMSS
// (suivi de -1.jpg, -2.jpg…). Le suffixe de date évite qu'un navigateur
// affiche une ancienne photo (cache d'un an).
function baseCheminPhoto() {
    const nom = $('lieuNom').value.trim();
    const firstCat = categoriesCochees()[0];
    const catName = firstCat && categories[firstCat] ? categories[firstCat].nom : 'Lieu';
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `${STORAGE_DIR}${sanitizeFileSegment(catName)}_${sanitizeFileSegment(nom) || 'SansNom'}_${stamp}`;
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

// Envoie les nouvelles photos (avec vignettes) et renvoie la liste finale, dans l'ordre.
// Chaque envoi réussi est ajouté à `envoyes`, pour pouvoir l'effacer en cas d'échec.
async function envoyerPhotos(submitBtn, envoyes) {
    const total = edition.photos.filter(p => p.file).length;
    const base = baseCheminPhoto();
    const resultat = [];
    let n = 0;
    for (const p of edition.photos) {
        if (!p.file) {
            resultat.push({ image: p.image, vignette: p.vignette || '' });
            continue;
        }
        n++;
        submitBtn.textContent = `Envoi des photos… ${n}/${total}`;
        const paths = await uploadPhotoAndVignette(p.file, `${base}-${n}.jpg`);
        envoyes.push(paths);
        resultat.push(paths);
    }
    return resultat;
}

// image/vignette reprennent la photo principale : ils servent encore aux
// pages déjà en cache chez les visiteurs, qui ne connaissent pas « photos »
function champsPhotos(photos) {
    return { photos, image: photos[0]?.image || '', vignette: photos[0]?.vignette || '' };
}

async function supprimerFichiersPhotos(photos) {
    for (const p of photos) {
        await deleteFromStorage(p.image);
        await deleteFromStorage(p.vignette);
    }
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

    const envoyes = []; // [{image, vignette}] : à supprimer si l'enregistrement échoue
    try {
        if (edition.id) {
            await enregistrerModifications(submitBtn, envoyes);
        } else {
            await creerLieu(valeurs, submitBtn, envoyes);
        }
        renderLieux();
        renderReferentiel('tag');
        forceCloseModals();
    } catch (err) {
        console.error(err);
        if (err?.annule) {
            toast('Enregistrement annulé.', '');
        } else {
            afficherErreur('Erreur : ' + messageErreur(err));
        }
        // Rollback : les nouvelles photos envoyées ne sont rattachées à aucune fiche
        await supprimerFichiersPhotos(envoyes);
    } finally {
        submitBtn.disabled = false;
        refreshDirtyState();
    }
});

function validerLieu(v) {
    if (!v.nom) return 'Le nom est obligatoire.';
    if (!v.slug) return 'Le slug est obligatoire (bouton ↺ pour le calculer à partir du nom).';
    if (!SLUG_VALIDE.test(v.slug)) return 'Slug invalide : seulement des minuscules sans accents, des chiffres et des tirets.';
    const doublon = lieux.find(l => l.id !== edition.id && valeursLieu(l).slug === v.slug);
    if (doublon) return `Ce slug est déjà utilisé par « ${doublon.nom} ».`;
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

async function creerLieu(valeurs, submitBtn, envoyes) {
    const photos = await envoyerPhotos(submitBtn, envoyes);
    const data = { ...valeurs, ...champsPhotos(photos) };

    submitBtn.textContent = 'Enregistrement…';
    const ref = await addDoc(collection(db, 'lieux'), {
        ...data, creeLe: serverTimestamp(), modifieLe: serverTimestamp()
    });
    const maintenant = new Date();
    lieux.push({ id: ref.id, ...data, creeLe: maintenant, modifieLe: maintenant });
    toast(`« ${data.nom} » ajouté ✓`, 'success');
}

// N'envoie que les champs modifiés ; les photos sont traitées à part
async function enregistrerModifications(submitBtn, envoyes) {
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
    if (photosModifiees() && clePhotos(photosDuLieu(snap.data())) !== clePhotos(edition.photosOrigine)) {
        conflits.push('photos');
    }
    if (conflits.length) {
        const noms = [...new Set(conflits.map(c => CHAMPS_LIEU[c] || c))].join(', ');
        if (!confirm(`Attention : ${noms} a été modifié par ailleurs depuis l'ouverture de cette fiche.\n\nÉcraser avec ta version ?`)) {
            throw Object.assign(new Error('annulé'), { annule: true });
        }
    }

    // Photos : nouvelles envoyées d'abord, retirées supprimées seulement après succès
    let retirees = [];
    if (photosModifiees()) {
        const photos = await envoyerPhotos(submitBtn, envoyes);
        retirees = edition.photosOrigine.filter(o => !photos.some(p => p.image === o.image));
        Object.assign(changes, champsPhotos(photos));
    }

    submitBtn.textContent = 'Enregistrement…';
    await updateDoc(doc(db, 'lieux', edition.id), { ...changes, modifieLe: serverTimestamp() });

    // Mise à jour locale, puis nettoyage des fichiers retirés
    const idx = lieux.findIndex(l => l.id === edition.id);
    if (idx !== -1) lieux[idx] = { ...lieux[idx], ...changes, modifieLe: new Date() };
    await supprimerFichiersPhotos(retirees);

    toast(`Enregistré : ${libelles.join(', ')} ✓`, 'success');
}

// =====================
// Modal CATÉGORIE / TAG (n'envoie aussi que les champs modifiés)
// =====================
const categorieModal = document.getElementById('categorieModal');
const categorieForm = document.getElementById('categorieForm');
const categorieFormError = document.getElementById('categorieFormError');
let refType = 'categorie';  // référentiel édité dans le modal

function openReferentielModal(type, cle) {
    refType = type;
    const conf = REFERENTIELS[type];
    categorieFormError.hidden = true;
    const isEdit = !!cle;
    const item = isEdit ? referentiel(type)[cle] : null;

    $('categorieModalTitle').textContent = `${isEdit ? 'Modifier' : 'Ajouter'} un${type === 'categorie' ? 'e' : ''} ${conf.libelle}`;
    const cleInput = $('categorieCle');
    cleInput.value = cle || '';
    cleInput.readOnly = isEdit;  // clé non modifiable en édition
    cleInput.placeholder = conf.placeholder;

    $('categorieNom').value = item?.nom || '';
    $('categorieNomEn').value = item?.nom_en || '';
    $('categorieIcon').value = item?.icon || '';
    $('categorieCouleur').value = item?.couleur || '#ff4500';
    $('categorieCouleurRow').hidden = !conf.couleur;
    $('categorieFamilleRow').hidden = !conf.couleur;
    $('categorieFamille').value = conf.couleur ? familleDe(cle, item) : 'manger';

    showModal(categorieModal);
}

categorieForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    categorieFormError.hidden = true;
    const conf = REFERENTIELS[refType];
    const items = referentiel(refType);

    const cle = $('categorieCle').value.trim().toLowerCase();
    if (!cle) {
        categorieFormError.hidden = false;
        categorieFormError.textContent = 'Clé obligatoire.';
        return;
    }
    const isEdit = !!items[cle];

    const data = {
        nom: $('categorieNom').value.trim(),
        nom_en: $('categorieNomEn').value.trim(),
        icon: $('categorieIcon').value.trim()
    };
    if (conf.couleur) {
        data.couleur = $('categorieCouleur').value;
        data.famille = $('categorieFamille').value;
    }

    try {
        if (isEdit) {
            const avant = items[cle];
            const changes = {};
            for (const [k, v] of Object.entries(data)) {
                if ((avant[k] || '') !== v) changes[k] = v;
            }
            if (Object.keys(changes).length === 0) {
                toast('Aucune modification.', '');
                forceCloseModals();
                return;
            }
            await updateDoc(doc(db, conf.collection, cle), changes);
            items[cle] = { ...avant, ...changes };
        } else {
            if (!data.nom_en) delete data.nom_en;
            await setDoc(doc(db, conf.collection, cle), data);
            items[cle] = data;
        }
        renderReferentiel(refType);
        populateCategoryFilter();
        renderLieux();  // pour mettre à jour les badges dans le tableau lieux
        toast(`${conf.libelle.charAt(0).toUpperCase() + conf.libelle.slice(1)} ${isEdit ? 'modifié' : 'ajouté'}${refType === 'categorie' ? 'e' : ''} ✓`, 'success');
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
    pendingDelete = { type: 'lieu', id, nom: lieu.nom, photos: photosDuLieu(lieu) };
    confirmMessage.textContent = `Supprimer le lieu "${lieu.nom}" ? Cette action est irréversible.`;
    showModal(confirmModal);
}

function confirmDeleteReferentiel(type, cle) {
    const conf = REFERENTIELS[type];
    const item = referentiel(type)[cle];
    // Vérifier si des lieux l'utilisent
    const usedBy = lieux.filter(l => (l[conf.champLieu] || []).includes(cle));
    if (usedBy.length > 0) {
        toast(`Impossible : ${usedBy.length} lieu(x) utilisent ce${type === 'categorie' ? 'tte' : ''} ${conf.libelle}.`, 'error');
        return;
    }
    pendingDelete = { type, id: cle, nom: item?.nom };
    confirmMessage.textContent = `Supprimer ${type === 'categorie' ? 'la catégorie' : 'le tag'} "${item?.nom}" ? Cette action est irréversible.`;
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
            renderReferentiel('tag');
            // Suppression best-effort des photos et de leurs vignettes
            await supprimerFichiersPhotos(pendingDelete.photos);
            toast('Lieu supprimé ✓', 'success');
        } else {
            const conf = REFERENTIELS[pendingDelete.type];
            await deleteDoc(doc(db, conf.collection, pendingDelete.id));
            delete referentiel(pendingDelete.type)[pendingDelete.id];
            renderReferentiel(pendingDelete.type);
            populateCategoryFilter();
            toast(`${pendingDelete.type === 'categorie' ? 'Catégorie supprimée' : 'Tag supprimé'} ✓`, 'success');
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
        return !!(v.nom || v.description || v.description_en || v.description_longue || v.description_longue_en
            || v.instagram || v.adresse || v.site || v.telephone || edition.photos.length);
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
    revoquerApercus();
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

// Quitter la page avec une fiche ou une édition groupée non enregistrée
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedLieu() || nbLieuxModifiesGroupe() > 0) {
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

// Timestamp Firestore ou Date → "12/03/2026"
function dateTexte(valeur) {
    const d = valeur?.toDate ? valeur.toDate() : new Date(valeur);
    return isNaN(d) ? '' : d.toLocaleDateString('fr-FR');
}
