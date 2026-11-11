import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Snowflake } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { eur, pctPlain } from "../lib/finance";
import { useApparence } from "../lib/ApparenceContext";
import "./BouleDeNeige.css";

/**
 * L'effet boule de neige, littéralement.
 *
 * Une boule dévale une pente au fil des années de la projection. Sa SURFACE
 * suit le capital : le cœur bleuté est ce qui a été versé, la couche blanche
 * autour ce que les intérêts ont ajouté. Au début la couche est une pellicule ;
 * à la fin elle pèse autant que le cœur, parfois plus — et c'est exactement ce
 * que la formule des intérêts composés ne montre pas.
 *
 * Elle reprend la série de la projection (mêmes curseurs, même mode volatil) :
 * rien n'est recalculé ici. En mode volatil, la boule fond les mauvaises
 * années.
 *
 * CHARGÉ À LA DEMANDE : ce fichier et sa feuille de style forment un fragment
 * à part, téléchargé seulement quand la carte approche de l'écran (voir
 * Simulation.jsx). Le dessin passe par un canvas, animé UNIQUEMENT pendant la
 * descente — quelques secondes — puis immobile : rien ne tourne en continu.
 *
 * Effets sobres ou animations coupées : pas de descente automatique, la boule
 * est posée à la dernière année et le curseur la déplace d'un cran à l'autre.
 */

/** Capital, versements et intérêts à un instant `annee` (fractionnaire). */
export function etatBoule(serie = [], annee = 0) {
  if (serie.length === 0) return { total: 0, versed: 0, interets: 0 };
  const a = Math.max(0, Math.min(serie.length - 1, annee));
  const i = Math.floor(a);
  const j = Math.min(serie.length - 1, i + 1);
  const f = a - i;
  const total = serie[i].total + (serie[j].total - serie[i].total) * f;
  const versed = serie[i].versed + (serie[j].versed - serie[i].versed) * f;
  return { total, versed, interets: total - versed };
}

/** Rayon de la boule : sa surface, et non son diamètre, suit le capital. */
export function rayonBoule(total, maximum, rMin, rMax) {
  if (!(maximum > 0) || !(total > 0)) return rMin;
  return rMin + (rMax - rMin) * Math.sqrt(Math.min(1, total / maximum));
}

/** Pas des repères d'année le long de la pente : huit étiquettes au plus. */
export function pasReperes(annees) {
  return [1, 2, 5, 10, 20].find((p) => annees / p <= 8) || 20;
}

const adoucir = (p) => 0.5 - 0.5 * Math.cos(Math.PI * p);
const desadoucir = (e) => Math.acos(1 - 2 * Math.max(0, Math.min(1, e))) / Math.PI;

/** Taches de la boule, en coordonnées polaires : elles font lire la rotation. */
const TACHES = [
  [0.55, 0.3], [0.7, 2.1], [0.4, 3.6], [0.78, 4.7], [0.25, 5.6], [0.62, 1.2],
];

function palette(canvas) {
  // Le fond de l'application dit le thème : le canvas ne lit pas les classes.
  const [r, g, b] = getComputedStyle(canvas).getPropertyValue("--c-slate-950").trim().split(/\s+/).map(Number);
  const clair = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
  return clair
    ? {
        pente: ["rgba(30,64,175,0.10)", "rgba(30,64,175,0.02)"],
        crete: "rgba(30,41,59,0.32)",
        texte: "rgba(51,65,85,0.85)",
        boule: ["#ffffff", "#dbeafe"],
        contour: "rgba(59,130,246,0.55)",
        coeur: "rgba(37,99,235,0.42)",
        tache: "rgba(30,64,175,0.16)",
        ombre: "rgba(15,23,42,0.16)",
        neige: "rgba(96,165,250,0.6)",
      }
    : {
        pente: ["rgba(226,232,240,0.16)", "rgba(226,232,240,0.02)"],
        crete: "rgba(226,232,240,0.42)",
        texte: "rgba(148,163,184,0.95)",
        boule: ["#ffffff", "#cbd5e1"],
        contour: "rgba(255,255,255,0.0)",
        coeur: "rgba(56,130,246,0.6)",
        tache: "rgba(71,85,105,0.3)",
        ombre: "rgba(0,0,0,0.35)",
        neige: "rgba(255,255,255,0.75)",
      };
}

export default function BouleDeNeige({ serie = [] }) {
  const annees = Math.max(1, serie.length - 1);
  const { effets, mouvementReduit } = useApparence();
  const vivant = effets === "vivant" && !mouvementReduit;

  const cadre = useRef(null);
  const canvas = useRef(null);
  // Tout ce que la boucle d'animation lit et écrit vit dans des refs : une
  // image ne doit jamais déclencher un rendu React.
  const avance = useRef(1); // temps écoulé, de 0 à 1
  const scene = useRef({ w: 0, h: 0, particules: [] });
  const dejaJouee = useRef(false);
  const [lecture, setLecture] = useState(false);
  // `null` : la boule est en bas de la pente, quelle que soit la durée de la
  // projection — allonger celle-ci ne doit pas la laisser à mi-chemin.
  const [annee, setAnnee] = useState(null);
  const anneeRef = useRef(annees);
  const aLaFin = useRef(true);
  const anneeVue = annee == null ? annees : Math.min(annee, annees);

  const poserAnnee = useCallback(
    (entier) => {
      anneeRef.current = entier;
      aLaFin.current = entier >= annees;
      setAnnee(entier >= annees ? null : entier);
    },
    [annees]
  );

  const dessiner = useCallback(
    (enMouvement = false, dt = 16) => {
      const c = canvas.current;
      const ctx = c?.getContext?.("2d");
      const { w, h } = scene.current;
      if (!ctx || !w || !h) return;
      const p = scene.current.palette || (scene.current.palette = palette(c));
      const position = adoucir(avance.current) * annees;
      const t = position / annees;
      const maximum = serie.reduce((m, s) => Math.max(m, s.total), 0);
      const { total, versed } = etatBoule(serie, position);

      const rMax = Math.min(46, h * 0.2, w * 0.11);
      const rMin = Math.max(5, rMax * 0.16);
      const x0 = 30;
      // Le départ descend d'autant que la boule est grosse au départ : un
      // capital qui grossit peu donne une boule déjà large, qui ne doit pas
      // sortir par le haut.
      const rDepart = rayonBoule(serie[0]?.total, maximum, rMin, rMax);
      const y0 = Math.max(h * 0.2, rDepart * 2 + 8);
      const x1 = w - rMax * 1.7 - 12;
      const y1 = h - 34;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const longueur = Math.hypot(dx, dy);
      const nx = dy / longueur;
      const ny = -dx / longueur;
      const pente = dy / dx;
      const surPente = (x) => y0 + (x - x0) * pente;

      ctx.clearRect(0, 0, w, h);

      // La pente.
      const degrade = ctx.createLinearGradient(0, y0, 0, h);
      degrade.addColorStop(0, p.pente[0]);
      degrade.addColorStop(1, p.pente[1]);
      ctx.beginPath();
      ctx.moveTo(0, surPente(0));
      ctx.lineTo(w, surPente(w));
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = degrade;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, surPente(0));
      ctx.lineTo(w, surPente(w));
      ctx.strokeStyle = p.crete;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Repères d'année, plantés dans la pente.
      const pas = pasReperes(annees);
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillStyle = p.texte;
      ctx.strokeStyle = p.crete;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineWidth = 1;
      for (let k = 0; k <= annees; k += pas) {
        const px = x0 + dx * (k / annees);
        const py = y0 + dy * (k / annees);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - nx * 6, py - ny * 6);
        ctx.stroke();
        ctx.fillText(k === 0 ? "Départ" : `An ${k}`, px - nx * 10, py - ny * 10);
      }

      // La boule : posée sur la pente, donc décalée de son rayon le long de la normale.
      const r = rayonBoule(total, maximum, rMin, rMax);
      const cx = x0 + dx * t + nx * r;
      const cy = y0 + dy * t + ny * r;
      const angle = (longueur * t) / Math.max(10, (rMin + r) / 2);

      ctx.beginPath();
      ctx.ellipse(x0 + dx * t + 3, y0 + dy * t + 2, r * 0.95, r * 0.24, Math.atan(pente), 0, Math.PI * 2);
      ctx.fillStyle = p.ombre;
      ctx.fill();

      const blanc = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      blanc.addColorStop(0, p.boule[0]);
      blanc.addColorStop(1, p.boule[1]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = blanc;
      ctx.fill();
      ctx.strokeStyle = p.contour;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Le cœur : ce qui a été versé. Sa surface garde la même échelle.
      const rc = total > 0 ? r * Math.sqrt(Math.max(0, Math.min(1, versed / total))) : r;
      ctx.beginPath();
      ctx.arc(cx, cy, rc, 0, Math.PI * 2);
      ctx.fillStyle = p.coeur;
      ctx.fill();

      // Les taches tournent avec la boule.
      ctx.fillStyle = p.tache;
      for (const [rho, alpha] of TACHES) {
        ctx.beginPath();
        ctx.arc(cx + Math.cos(alpha + angle) * rho * r, cy + Math.sin(alpha + angle) * rho * r, Math.max(0.8, r * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }

      // La neige soulevée, seulement pendant la descente.
      const particules = scene.current.particules;
      if (enMouvement && particules.length < 26 && avance.current < 0.98) {
        particules.push({
          x: x0 + dx * t - 2,
          y: y0 + dy * t - 1,
          vx: -(0.6 + Math.random() * 1.4),
          vy: -(0.5 + Math.random() * 1.6),
          vie: 1,
          r: 1 + Math.random() * 1.8 + r * 0.03,
        });
      }
      ctx.fillStyle = p.neige;
      for (let i = particules.length - 1; i >= 0; i--) {
        const q = particules[i];
        q.x += q.vx * (dt / 16);
        q.y += q.vy * (dt / 16);
        q.vy += 0.07 * (dt / 16);
        q.vie -= 0.028 * (dt / 16);
        if (q.vie <= 0) {
          particules.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = q.vie * 0.8;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    [serie, annees]
  );

  // Taille réelle du canvas, pixels de l'écran compris.
  useEffect(() => {
    const el = cadre.current;
    const c = canvas.current;
    if (!el || !c) return undefined;
    const ajuster = () => {
      const { width, height } = el.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      scene.current.w = width;
      scene.current.h = height;
      c.width = Math.round(width * ratio);
      c.height = Math.round(height * ratio);
      c.getContext?.("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
      dessiner();
    };
    ajuster();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observateur = new ResizeObserver(ajuster);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [dessiner]);

  // Changement de thème : les couleurs du canvas sont relues.
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return undefined;
    const observateur = new MutationObserver(() => {
      scene.current.palette = null;
      dessiner();
    });
    observateur.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observateur.disconnect();
  }, [dessiner]);

  // La descente : une boucle d'images, vivante le temps de la lecture seulement.
  useEffect(() => {
    if (!lecture) return undefined;
    const duree = Math.max(3600, Math.min(7000, annees * 280));
    let image = 0;
    let dernier = performance.now();
    const boucle = (maintenant) => {
      const dt = Math.min(64, maintenant - dernier);
      dernier = maintenant;
      avance.current = Math.min(1, avance.current + dt / duree);
      dessiner(true, dt);
      const entier = Math.round(adoucir(avance.current) * annees);
      if (entier !== anneeRef.current) poserAnnee(entier);
      if (avance.current >= 1 && scene.current.particules.length === 0) {
        setLecture(false);
        return;
      }
      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(image);
  }, [lecture, annees, dessiner, poserAnnee]);

  // Première apparition à l'écran : la boule part d'elle-même, une fois. Elle
  // s'arrête si la carte quitte l'écran.
  useEffect(() => {
    const el = cadre.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observateur = new IntersectionObserver(
      ([entree]) => {
        if (entree.isIntersecting && vivant && !dejaJouee.current) {
          dejaJouee.current = true;
          avance.current = 0;
          poserAnnee(0);
          setLecture(true);
        } else if (!entree.isIntersecting) {
          setLecture(false);
        }
      },
      { threshold: 0.45 }
    );
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [vivant, poserAnnee]);

  // Les curseurs de la projection ont bougé : même année, nouvelle boule.
  useEffect(() => {
    avance.current = aLaFin.current ? 1 : desadoucir(Math.min(anneeRef.current, annees) / annees);
    dessiner();
  }, [serie, annees, dessiner]);

  const basculer = () => {
    if (lecture) return setLecture(false);
    if (avance.current >= 1) {
      avance.current = 0;
      scene.current.particules.length = 0;
    }
    dejaJouee.current = true;
    if (!vivant) {
      // Sans animation : on va directement à la fin.
      avance.current = 1;
      poserAnnee(annees);
      return dessiner();
    }
    return setLecture(true);
  };

  const allerA = (valeur) => {
    const entier = Math.max(0, Math.min(annees, Number(valeur) || 0));
    setLecture(false);
    dejaJouee.current = true;
    scene.current.particules.length = 0;
    avance.current = desadoucir(entier / annees);
    poserAnnee(entier);
    dessiner();
  };

  const etat = etatBoule(serie, anneeVue);
  const partInterets = etat.total > 0 ? (etat.interets / etat.total) * 100 : 0;
  const finie = !lecture && anneeVue >= annees;

  return (
    <Card accent={CARD_THEMES.amber}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <CardLabel icon={Snowflake}>L'effet boule de neige</CardLabel>
        <button type="button" onClick={basculer} className="boule-bouton">
          {lecture ? <Pause size={13} aria-hidden="true" /> : finie ? <RotateCcw size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
          {lecture ? "Pause" : finie ? "Relancer la boule" : "Lancer la boule"}
        </button>
      </div>

      <div ref={cadre} className="boule-scene">
        <canvas ref={canvas} aria-hidden="true" />
        <div className="boule-affichage" aria-live="off">
          <span className="boule-annee">{anneeVue === 0 ? "Départ" : `An ${anneeVue}`}</span>
          <span className="boule-total font-data ghost-blur">{eur(etat.total)}</span>
          <span className="boule-detail">
            dont <span className="font-data ghost-blur">{eur(Math.max(0, etat.interets))}</span> d'intérêts
            {etat.interets > 0 && <> · {pctPlain(partInterets, 0)} de la boule</>}
          </span>
        </div>
      </div>

      <label className="boule-curseur">
        <span className="sr-only">Année de la projection</span>
        <input
          type="range"
          min={0}
          max={annees}
          step={1}
          value={anneeVue}
          onChange={(e) => allerA(e.target.value)}
          aria-valuetext={anneeVue === 0 ? "Départ" : `Année ${anneeVue}`}
        />
      </label>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-micro text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="boule-legende boule-legende-coeur" /> Le cœur : ce que tu as versé
        </span>
        <span className="flex items-center gap-1.5">
          <span className="boule-legende boule-legende-couche" /> La couche blanche : les intérêts
        </span>
      </div>
      <p className="text-micro text-slate-500 mt-2">
        La surface de la boule suit le capital. Les premières années, les intérêts ne sont qu'une pellicule ; ils
        s'ajoutent ensuite à eux-mêmes, et la couche s'épaissit de plus en plus vite.
      </p>
    </Card>
  );
}
