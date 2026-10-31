import { useEffect, useRef, useState } from "react";
import { Smartphone, Send, ScanLine, Pause, Play, KeyRound } from "lucide-react";
import qrcode from "qrcode-generator";
import Modal from "./Modal";
import { genererCode, emballer, deballer, decouper, creerReception, normaliserCode } from "../lib/transfertQr";

/**
 * Transfert vers un nouvel appareil par QR codes, sans compte (voir
 * transfertQr.js). L'appareil qui envoie fait défiler les QR codes et affiche
 * le code ; celui qui reçoit les filme, puis demande le code.
 */
const CADENCE_MS = 250;
/** Coupe la caméra : les pistes vidéo restent actives tant qu'on ne les arrête pas. */
const couper = (flux) => {
  flux.current?.getTracks().forEach((t) => t.stop());
  flux.current = null;
};
const ONGLET = "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors";

function QrCanvas({ texte }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !texte) return;
    const qr = qrcode(0, "L");
    qr.addData(texte);
    qr.make();
    const n = qr.getModuleCount();
    const marge = 4;
    const cellule = Math.max(1, Math.floor(canvas.width / (n + marge * 2)));
    const decalage = Math.floor((canvas.width - cellule * n) / 2);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    for (let l = 0; l < n; l += 1) {
      for (let c = 0; c < n; c += 1) {
        if (qr.isDark(l, c)) ctx.fillRect(decalage + c * cellule, decalage + l * cellule, cellule, cellule);
      }
    }
  }, [texte]);
  return <canvas ref={ref} width={480} height={480} className="w-full max-w-[320px] aspect-square rounded-xl" role="img" aria-label="QR code du transfert" />;
}

function Envoyer({ exporter }) {
  const [envoi, setEnvoi] = useState(null);
  const [index, setIndex] = useState(0);
  const [pause, setPause] = useState(false);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!envoi || pause) return undefined;
    const minuterie = setInterval(() => setIndex((i) => (i + 1) % envoi.trames.length), CADENCE_MS);
    return () => clearInterval(minuterie);
  }, [envoi, pause]);

  const preparer = async () => {
    setErreur("");
    setEnCours(true);
    try {
      const code = genererCode();
      const paquet = await emballer(exporter(), code);
      setEnvoi({ code, trames: decouper(paquet), octets: Math.round((paquet.length * 3) / 4) });
      setIndex(0);
    } catch {
      setErreur("La préparation a échoué : ce navigateur ne prend peut-être pas en charge le chiffrement.");
    } finally {
      setEnCours(false);
    }
  };

  if (!envoi) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-300">
          Tes données vont défiler en QR codes, chiffrées par un code à usage unique. Ouvre Patrium sur l'autre
          appareil, choisis « Recevoir » et filme cet écran.
        </p>
        <button
          type="button"
          onClick={preparer}
          disabled={enCours}
          className="self-start flex items-center gap-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-slate-950"
        >
          <Send size={14} aria-hidden="true" /> {enCours ? "Préparation…" : "Préparer le transfert"}
        </button>
        {erreur && <p className="text-micro etat-critique">{erreur}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <QrCanvas texte={envoi.trames[index]} />
      <div className="flex items-center gap-3 text-micro text-slate-500">
        <span className="font-data">
          {index + 1} / {envoi.trames.length}
        </span>
        <span>{Math.max(1, Math.round(envoi.octets / 1024))} Ko chiffrés</span>
        <button type="button" onClick={() => setPause((p) => !p)} className="flex items-center gap-1 text-slate-400 hover:text-slate-200">
          {pause ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />} {pause ? "Reprendre" : "Pause"}
        </button>
      </div>
      <div className="w-full rounded-xl border border-emerald-400/30 bg-emerald-500/5 px-3 py-2.5 text-center">
        <div className="text-micro text-slate-400">Code à taper sur l'autre appareil</div>
        <div className="mt-1 font-data text-2xl tracking-widest text-emerald-100">{envoi.code}</div>
      </div>
      <p className="text-micro text-slate-500 text-center">
        Les QR codes passent en boucle : un code manqué revient au tour suivant. Garde cette fenêtre ouverte jusqu'à
        la fin de la réception.
      </p>
    </div>
  );
}

function Recevoir({ onRecu }) {
  const videoRef = useRef(null);
  const [etape, setEtape] = useState("attente");
  const [progression, setProgression] = useState({ recus: 0, total: 0 });
  const [paquet, setPaquet] = useState(null);
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState("");
  const [verification, setVerification] = useState(false);
  const flux = useRef(null);

  useEffect(() => () => couper(flux), []);

  useEffect(() => {
    if (etape !== "camera") return undefined;
    let actif = true;
    let image = 0;
    // La vidéo n'existe qu'une fois l'étape « camera » rendue.
    if (videoRef.current && flux.current) {
      videoRef.current.srcObject = flux.current;
      videoRef.current.play().catch(() => {});
    }
    const reception = creerReception();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const detecteur = "BarcodeDetector" in window ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
    let jsQR = null;
    if (!detecteur) import("jsqr").then((m) => (jsQR = m.default));

    const lire = async () => {
      const video = videoRef.current;
      if (!actif || !video) return;
      if (video.readyState >= 2 && image++ % 2 === 0) {
        const echelle = Math.min(1, 640 / (video.videoWidth || 640));
        canvas.width = Math.round(video.videoWidth * echelle);
        canvas.height = Math.round(video.videoHeight * echelle);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let textes = [];
        try {
          if (detecteur) {
            textes = (await detecteur.detect(canvas)).map((c) => c.rawValue);
          } else if (jsQR) {
            const lu = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
            if (lu) textes = [lu.data];
          }
        } catch {
          /* image illisible : on passe à la suivante */
        }
        for (const t of textes) {
          const r = reception.ajouter(t);
          if (r.valide) setProgression({ recus: r.recus, total: r.total });
          if (r.complet) {
            actif = false;
            couper(flux);
            setPaquet(reception.assembler());
            setEtape("code");
            return;
          }
        }
      }
      requestAnimationFrame(lire);
    };
    requestAnimationFrame(lire);
    return () => {
      actif = false;
    };
  }, [etape]);

  const demarrer = async () => {
    setErreur("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setErreur("Caméra indisponible dans ce navigateur : passe plutôt par l'export et l'import d'une sauvegarde.");
      return;
    }
    try {
      flux.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      setEtape("camera");
    } catch {
      setErreur("Accès à la caméra refusé. Autorise-le dans les réglages du navigateur, puis réessaie.");
    }
  };

  const valider = async (e) => {
    e.preventDefault();
    setErreur("");
    setVerification(true);
    try {
      const donnees = await deballer(paquet, code);
      await onRecu(donnees);
    } catch (err) {
      setErreur(err?.name === "CodeIncorrect" ? "Ce code ne correspond pas. Vérifie-le sur l'autre appareil." : "Les données reçues sont illisibles.");
    } finally {
      setVerification(false);
    }
  };

  if (etape === "code") {
    return (
      <form onSubmit={valider} className="flex flex-col gap-3">
        <p className="text-sm text-emerald-200">Tout est reçu ({progression.total} QR codes).</p>
        <label htmlFor="transfert-code" className="text-micro text-slate-500">Code affiché sur l'autre appareil</label>
        <input
          id="transfert-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXXX-XXXXX"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-data text-lg tracking-widest uppercase focus:outline-none focus:border-emerald-400/60"
        />
        <button
          type="submit"
          disabled={normaliserCode(code).length < 10 || verification}
          className="self-start flex items-center gap-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-slate-950"
        >
          <KeyRound size={14} aria-hidden="true" /> {verification ? "Vérification…" : "Déchiffrer et restaurer"}
        </button>
        {erreur && <p className="text-micro etat-critique">{erreur}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {etape === "camera" ? (
        <>
          <video ref={videoRef} muted playsInline className="w-full max-h-72 rounded-xl bg-black object-cover" aria-label="Aperçu de la caméra" />
          <div>
            <div className="flex justify-between text-micro text-slate-500">
              <span>{progression.total ? "Réception…" : "Vise les QR codes de l'autre appareil"}</span>
              {progression.total > 0 && (
                <span className="font-data">
                  {progression.recus} / {progression.total}
                </span>
              )}
            </div>
            <div
              className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"
              role="progressbar"
              aria-label="QR codes reçus"
              aria-valuemin={0}
              aria-valuemax={progression.total || 1}
              aria-valuenow={progression.recus}
            >
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progression.total ? (progression.recus / progression.total) * 100 : 0}%` }} />
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-300">
            Sur l'appareil qui a tes données, ouvre « Transférer vers un autre appareil » et choisis « Envoyer ». Les
            données de cet appareil-ci seront remplacées.
          </p>
          <button
            type="button"
            onClick={demarrer}
            className="self-start flex items-center gap-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 px-4 py-2 text-xs font-semibold text-slate-950"
          >
            <ScanLine size={14} aria-hidden="true" /> Activer la caméra
          </button>
        </>
      )}
      {erreur && <p className="text-micro etat-critique">{erreur}</p>}
    </div>
  );
}

export default function TransfertAppareil({ ouvert, onFermer, exporter, onRecu, modeInitial = "envoyer" }) {
  const [mode, setMode] = useState(modeInitial);
  return (
    <Modal open={ouvert} onClose={onFermer} label="Transférer vers un autre appareil" showClose>
      <div className="p-5 flex flex-col gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg text-slate-50">
            <Smartphone size={18} className="text-emerald-300" aria-hidden="true" /> Transférer vers un autre appareil
          </h2>
          <p className="text-micro text-slate-500 mt-1">Sans compte ni serveur : d'écran à caméra, chiffré de bout en bout.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
          {[
            ["envoyer", "Envoyer", Send],
            ["recevoir", "Recevoir", ScanLine],
          ].map(([id, libelle, Icone]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className={`${ONGLET} ${mode === id ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Icone size={13} aria-hidden="true" /> {libelle}
            </button>
          ))}
        </div>
        {/* Chaque mode garde son propre état ; le démonter coupe la caméra ou le défilement. */}
        {ouvert && (mode === "envoyer" ? <Envoyer exporter={exporter} /> : <Recevoir onRecu={onRecu} />)}
      </div>
    </Modal>
  );
}
