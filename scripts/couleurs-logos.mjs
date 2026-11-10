#!/usr/bin/env node
/**
 * Relève la couleur de chaque logo d'entreprise connu.
 *
 *   node scripts/couleurs-logos.mjs
 *
 * Les logos viennent du service de favicons de DuckDuckGo (voir AssetLogo.jsx),
 * qui n'autorise pas la lecture depuis le navigateur : une image d'une autre
 * origine se dessine, mais ses pixels restent illisibles. La couleur est donc
 * relevée ici, une fois, et écrite dans src/lib/couleursMarques.json, que
 * l'application lit comme une simple table.
 *
 * Aucune dépendance : un .ico contient des images PNG ou BMP, que le module
 * zlib de Node suffit à décoder.
 *
 * La couleur retenue est la teinte DOMINANTE parmi les pixels assez saturés —
 * le blanc, le noir et les gris d'un logo ne disent rien de la marque. Un logo
 * sans couleur franche n'a pas d'entrée : l'application garde alors sa teinte
 * de domaine.
 */
import { writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { DOMAINES_LOGOS } from "../src/lib/domainesLogos.js";

const SORTIE = new URL("../src/lib/couleursMarques.json", import.meta.url);

/* ───────────────────────────────── Décodage ───────────────────────────────── */

function decoderPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("pas un PNG");
  let pos = 8;
  let largeur = 0;
  let hauteur = 0;
  let profondeur = 0;
  let typeCouleur = 0;
  let palette = null;
  let transparence = null;
  const idat = [];
  while (pos < buf.length) {
    const longueur = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const donnees = buf.subarray(pos + 8, pos + 8 + longueur);
    if (type === "IHDR") {
      largeur = donnees.readUInt32BE(0);
      hauteur = donnees.readUInt32BE(4);
      profondeur = donnees[8];
      typeCouleur = donnees[9];
      if (donnees[12] !== 0) throw new Error("PNG entrelacé non pris en charge");
    } else if (type === "PLTE") palette = donnees;
    else if (type === "tRNS") transparence = donnees;
    else if (type === "IDAT") idat.push(donnees);
    else if (type === "IEND") break;
    pos += 12 + longueur;
  }
  if (profondeur !== 8) throw new Error(`profondeur ${profondeur} non prise en charge`);
  const canaux = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[typeCouleur];
  const brut = inflateSync(Buffer.concat(idat));
  const ligne = largeur * canaux;
  const pixels = Buffer.alloc(ligne * hauteur);
  let precedente = Buffer.alloc(ligne);
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (ligne + 1)];
    const src = brut.subarray(y * (ligne + 1) + 1, (y + 1) * (ligne + 1));
    const cour = pixels.subarray(y * ligne, (y + 1) * ligne);
    for (let x = 0; x < ligne; x++) {
      const a = x >= canaux ? cour[x - canaux] : 0;
      const b = precedente[x];
      const c = x >= canaux ? precedente[x - canaux] : 0;
      let v = src[x];
      if (filtre === 1) v += a;
      else if (filtre === 2) v += b;
      else if (filtre === 3) v += (a + b) >> 1;
      else if (filtre === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cour[x] = v & 0xff;
    }
    precedente = cour;
  }
  const rgba = [];
  for (let i = 0; i < largeur * hauteur; i++) {
    const o = i * canaux;
    if (typeCouleur === 6) rgba.push([pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3]]);
    else if (typeCouleur === 2) rgba.push([pixels[o], pixels[o + 1], pixels[o + 2], 255]);
    else if (typeCouleur === 4) rgba.push([pixels[o], pixels[o], pixels[o], pixels[o + 1]]);
    else if (typeCouleur === 0) rgba.push([pixels[o], pixels[o], pixels[o], 255]);
    else if (typeCouleur === 3 && palette) {
      const k = pixels[o];
      rgba.push([palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], transparence?.[k] ?? 255]);
    }
  }
  return rgba;
}

function decoderBmp(buf) {
  const largeur = buf.readInt32LE(4);
  const hauteur = Math.abs(buf.readInt32LE(8)) / 2; // un BMP d'icône double sa hauteur (masque)
  const bits = buf.readUInt16LE(14);
  const entete = buf.readUInt32LE(0);
  if (bits <= 8) return decoderBmpPalette(buf, largeur, hauteur, bits, entete);
  if (bits !== 32 && bits !== 24) throw new Error(`BMP ${bits} bits non pris en charge`);
  const octets = bits / 8;
  const pas = Math.ceil((largeur * octets) / 4) * 4;
  const rgba = [];
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const o = entete + y * pas + x * octets;
      rgba.push([buf[o + 2], buf[o + 1], buf[o], bits === 32 ? buf[o + 3] : 255]);
    }
  }
  return rgba;
}

/** BMP à palette (1, 4 ou 8 bits), avec son masque de transparence d'icône. */
function decoderBmpPalette(buf, largeur, hauteur, bits, entete) {
  const nbCouleurs = buf.readUInt32LE(32) || 2 ** bits;
  const palette = [];
  for (let i = 0; i < nbCouleurs; i++) {
    const o = entete + i * 4;
    palette.push([buf[o + 2], buf[o + 1], buf[o]]);
  }
  const debut = entete + nbCouleurs * 4;
  const pas = Math.ceil((largeur * bits) / 32) * 4;
  const pasMasque = Math.ceil(largeur / 32) * 4;
  const debutMasque = debut + pas * hauteur;
  const rgba = [];
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const bit = x * bits;
      const octet = buf[debut + y * pas + (bit >> 3)];
      const index = (octet >> (8 - bits - (bit & 7))) & ((1 << bits) - 1);
      const masque = buf[debutMasque + y * pasMasque + (x >> 3)];
      const transparent = masque !== undefined && (masque >> (7 - (x & 7))) & 1;
      const [r, g, b] = palette[index] || [0, 0, 0];
      rgba.push([r, g, b, transparent ? 0 : 255]);
    }
  }
  return rgba;
}

function decoderIco(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return decoderPng(buf);
  if (buf.readUInt16LE(2) !== 1) throw new Error("pas une icône");
  const n = buf.readUInt16LE(4);
  // La plus grande image du fichier : plus de pixels, moins d'anticrénelage.
  let meilleure = null;
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16;
    const cote = buf[o] || 256;
    const taille = buf.readUInt32LE(o + 8);
    const decalage = buf.readUInt32LE(o + 12);
    if (!meilleure || cote > meilleure.cote) meilleure = { cote, taille, decalage };
  }
  const image = buf.subarray(meilleure.decalage, meilleure.decalage + meilleure.taille);
  return image.readUInt32BE(0) === 0x89504e47 ? decoderPng(image) : decoderBmp(image);
}

/* ─────────────────────────────── Couleur dominante ──────────────────────── */

function versHsl([r, g, b]) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h * 60, s, l];
}

export function couleurDominante(rgba) {
  const seaux = new Map();
  for (const px of rgba) {
    if (px[3] < 160) continue;
    const [h, s, l] = versHsl(px);
    if (s < 0.28 || l < 0.12 || l > 0.9) continue;
    const cle = Math.round(h / 15) % 24;
    const seau = seaux.get(cle) || { poids: 0, r: 0, g: 0, b: 0 };
    const poids = s;
    seau.poids += poids;
    seau.r += px[0] * poids;
    seau.g += px[1] * poids;
    seau.b += px[2] * poids;
    seaux.set(cle, seau);
  }
  const total = rgba.filter((p) => p[3] >= 160).length;
  const meilleur = [...seaux.values()].sort((a, b) => b.poids - a.poids)[0];
  // Moins de 6 % de pixels colorés : un logo gris avec un liseré, pas une couleur de marque.
  if (!meilleur || meilleur.poids < total * 0.06 * 0.4) return null;
  const hex = (v) => Math.round(v / meilleur.poids).toString(16).padStart(2, "0");
  return `#${hex(meilleur.r)}${hex(meilleur.g)}${hex(meilleur.b)}`;
}

/* ──────────────────────────────────── Relevé ─────────────────────────────── */

async function releve() {
  const resultat = {};
  const echecs = [];
  const file = Object.entries(DOMAINES_LOGOS);
  // Huit téléchargements à la fois : assez pour finir en quelques secondes,
  // assez peu pour ne pas ressembler à un aspirateur.
  const ouvrier = async () => {
    for (let suivant = file.shift(); suivant; suivant = file.shift()) {
      const [ticker, domaine] = suivant;
      try {
        const r = await fetch(`https://icons.duckduckgo.com/ip3/${domaine}.ico`, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const couleur = couleurDominante(decoderIco(Buffer.from(await r.arrayBuffer())));
        if (couleur) resultat[ticker] = couleur;
        else echecs.push(`${ticker} (logo sans couleur franche)`);
      } catch (e) {
        echecs.push(`${ticker} (${e.message})`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, ouvrier));
  const trie = Object.fromEntries(Object.entries(resultat).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(SORTIE, `${JSON.stringify(trie, null, 2)}\n`);
  console.log(`${Object.keys(trie).length} couleurs écrites dans src/lib/couleursMarques.json`);
  if (echecs.length) console.log(`Sans couleur : ${echecs.join(", ")}`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("couleurs-logos.mjs")) {
  releve();
}
