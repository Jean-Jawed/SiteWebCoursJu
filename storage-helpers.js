// =====================
// storage-helpers.js — Helpers partagés pour Firebase Storage
// Utilisés par lieux.js (lecture) et admin.js (lecture + écriture)
// =====================

import { storage, STORAGE_BUCKET } from './firebase-config.js';
import {
    ref, uploadBytes, deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

// Mêmes paramètres que le script Node (sharp) pour garder la cohérence
const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.80;

// Vignettes : version légère des photos pour les listes, polaroïds et l'admin
export const VIGNETTE_WIDTH = 480;
export const VIGNETTE_DIR = 'images/vignettes/';

/**
 * Construit l'URL publique de téléchargement d'un fichier dans Storage,
 * sans appel réseau supplémentaire (les règles autorisent la lecture publique).
 *
 * Format Firebase :
 *   https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{chemin-encodé}?alt=media
 *
 * @param {string} path — chemin dans le bucket, ex: "images/MonLieu.jpg"
 * @returns {string|null} URL publique, ou null si path est vide
 */
export function publicUrlFromPath(path) {
    if (!path) return null;
    const encoded = encodeURIComponent(path);
    return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encoded}?alt=media`;
}

/**
 * URL de la photo d'un lieu, en privilégiant la vignette quand elle existe
 * (les lieux créés avant les vignettes n'en ont pas : on retombe sur la photo).
 *
 * @param {{image?: string, vignette?: string}} lieu
 * @param {'vignette'|'photo'} taille
 * @returns {string|null}
 */
export function lieuPhotoUrl(lieu, taille = 'vignette') {
    if (!lieu) return null;
    if (taille === 'vignette' && lieu.vignette) return publicUrlFromPath(lieu.vignette);
    return publicUrlFromPath(lieu.image);
}

/**
 * Resize une image (File ou Blob) côté navigateur via Canvas.
 * Reproduit le comportement de l'ancien script sharp :
 *   - rotation auto selon EXIF (gérée nativement par createImageBitmap avec imageOrientation)
 *   - largeur max 1920, sans agrandir les images plus petites
 *   - sortie JPEG qualité 80
 *
 * @param {File|Blob} file
 * @param {number} [maxWidth] largeur maximale (1920 par défaut)
 * @returns {Promise<Blob>} JPEG resizé
 */
export async function resizeImage(file, maxWidth = MAX_WIDTH) {
    // createImageBitmap respecte l'orientation EXIF avec cette option,
    // ce qui évite que les photos prises en portrait soient affichées couchées.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    let { width, height } = bitmap;
    if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => blob ? resolve(blob) : reject(new Error('Conversion JPEG échouée')),
            'image/jpeg',
            JPEG_QUALITY
        );
    });
}

/**
 * Upload un Blob/File vers Storage à un chemin donné.
 *
 * @param {string} path — chemin de destination, ex: "images/Bar_Lechampdemars.jpg"
 * @param {Blob|File} blob
 * @returns {Promise<string>} le chemin (identique à path), pour chaîner facilement
 */
export async function uploadToStorage(path, blob) {
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob, {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000'
    });
    return path;
}

/**
 * Supprime un fichier dans Storage. N'échoue PAS si le fichier n'existe pas
 * (utile lors d'un remplacement où l'ancien chemin pourrait être obsolète).
 *
 * @param {string} path
 */
export async function deleteFromStorage(path) {
    if (!path) return;
    try {
        await deleteObject(ref(storage, path));
    } catch (err) {
        // Code 'storage/object-not-found' : on l'ignore silencieusement
        if (err.code !== 'storage/object-not-found') {
            console.warn('Suppression Storage échouée pour', path, err);
        }
    }
}

/**
 * Helper combiné : resize puis upload. Renvoie le chemin uploadé.
 *
 * @param {File|Blob} file
 * @param {string} path
 * @returns {Promise<string>}
 */
export async function resizeAndUpload(file, path) {
    const resized = await resizeImage(file);
    return uploadToStorage(path, resized);
}

/**
 * Envoie une photo et sa vignette. Renvoie les deux chemins.
 * En cas d'échec de la vignette, la photo déjà envoyée est supprimée.
 *
 * @param {File|Blob} file
 * @param {string} path — ex: "images/Librairie_LocusSolus_20261005-1432.jpg"
 * @returns {Promise<{image: string, vignette: string}>}
 */
export async function uploadPhotoAndVignette(file, path) {
    const vignettePath = VIGNETTE_DIR + path.split('/').pop();
    await resizeAndUpload(file, path);
    try {
        const small = await resizeImage(file, VIGNETTE_WIDTH);
        await uploadToStorage(vignettePath, small);
    } catch (err) {
        await deleteFromStorage(path);
        throw err;
    }
    return { image: path, vignette: vignettePath };
}
