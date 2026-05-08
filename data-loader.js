// =====================
// Module partagé : chargement des données depuis Firestore
// Utilisé par index.html, lieux.html (et potentiellement d'autres)
// =====================

import { db } from './firebase-config.js';
import { collection, getDocs, getDocsFromCache } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/**
 * Charge les lieux et catégories depuis Firestore.
 * @returns {Promise<{lieux: Array, categories: Object}>}
 */
export async function chargerDonnees() {
    // Tente d'abord le cache IndexedDB (instantané), sinon réseau
    async function fetchCollection(name) {
        try {
            const snap = await getDocsFromCache(collection(db, name));
            if (!snap.empty) return snap;
        } catch (_) {}
        return getDocs(collection(db, name));
    }

    const [lieuxSnap, categoriesSnap] = await Promise.all([
        fetchCollection('lieux'),
        fetchCollection('categories')
    ]);

    const lieux = lieuxSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    const categories = {};
    categoriesSnap.docs.forEach(doc => {
        categories[doc.id] = doc.data();
    });

    return { lieux, categories };
}
