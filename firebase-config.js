// =====================
// Configuration Firebase partagée
// Importé par script.js (site public) et admin.js (admin)
// =====================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyAO7sKvDOlgogRzBVXVIfNIU3nGSH97WN8",
    authDomain: "cours-julien.firebaseapp.com",
    projectId: "cours-julien",
    storageBucket: "cours-julien.firebasestorage.app",
    messagingSenderId: "1068451711607",
    appId: "1:1068451711607:web:531774e7d97a4e3bf7d472"
};

// Initialisation
const app = initializeApp(firebaseConfig);

// Export des services utilisés
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const auth = getAuth(app);
export const storage = getStorage(app);

// Nom du bucket — utile pour reconstruire les URLs publiques côté client
export const STORAGE_BUCKET = firebaseConfig.storageBucket;
