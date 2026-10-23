// =====================
// Module partagé : chargement des données depuis Firestore
// Utilisé par index.html, lieux.html (et potentiellement d'autres)
// =====================

import { db } from './firebase-config.js';
import { collection, getDocs, getDocsFromCache, getDocsFromServer } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/**
 * Charge les lieux (publiés), les catégories et les tags depuis Firestore.
 * @returns {Promise<{lieux: Array, categories: Object, tags: Object}>}
 */
export async function chargerDonnees() {
    // Réseau d'abord (données à jour), cache IndexedDB en secours si le réseau
    // est absent ou trop lent. Le cache seul ne se rafraîchissait jamais.
    async function fetchCollection(name) {
        const ref = collection(db, name);
        const delai = new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('délai')), 5000));
        try {
            return await Promise.race([getDocsFromServer(ref), delai]);
        } catch (_) {
            try {
                const snap = await getDocsFromCache(ref);
                if (!snap.empty) return snap;
            } catch (_) {}
            return getDocs(ref);
        }
    }

    const [lieuxSnap, categoriesSnap, tagsSnap] = await Promise.all([
        fetchCollection('lieux'),
        fetchCollection('categories'),
        fetchCollection('tags').catch(() => null)
    ]);

    // Les lieux non publiés (brouillons) restent dans l'admin
    const lieux = lieuxSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(lieu => lieu.publie !== false);

    const categories = {};
    categoriesSnap.docs.forEach(doc => {
        categories[doc.id] = doc.data();
    });

    const tags = {};
    tagsSnap?.docs.forEach(doc => {
        tags[doc.id] = doc.data();
    });

    return { lieux, categories, tags };
}
