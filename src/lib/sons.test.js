import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Les sons sont coupés par défaut : le test qui compte est celui du SILENCE.
 * Le module garde son contexte audio et l'heure du dernier son : il est
 * rechargé avant chaque test pour repartir de zéro.
 */
let contextes;

function installerAudio() {
  contextes = [];
  class FauxContexte {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = {};
      this.oscillateurs = 0;
      this.souffles = 0;
      contextes.push(this);
    }
    noeud() {
      const n = { connect: () => n };
      return n;
    }
    createOscillator() {
      this.oscillateurs += 1;
      const rampe = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
      return { ...this.noeud(), frequency: rampe, start() {}, stop() {} };
    }
    createGain() {
      return { ...this.noeud(), gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
    }
    createBuffer(_canaux, taille) {
      return { getChannelData: () => new Float32Array(taille) };
    }
    createBufferSource() {
      this.souffles += 1;
      return { ...this.noeud(), start() {} };
    }
    createBiquadFilter() {
      return { ...this.noeud(), frequency: { value: 0 }, Q: { value: 0 } };
    }
  }
  window.AudioContext = FauxContexte;
}

async function charger() {
  vi.resetModules();
  return import("./sons");
}

describe("sons", () => {
  beforeEach(() => {
    installerAudio();
    document.documentElement.removeAttribute("data-sons");
  });
  afterEach(() => {
    delete window.AudioContext;
    document.documentElement.removeAttribute("data-sons");
    vi.useRealTimers();
  });

  it("reste muet tant que le réglage n'est pas activé — aucun contexte audio n'est même créé", async () => {
    const { jouerSon, sonsActifs } = await charger();
    expect(sonsActifs()).toBe(false);
    expect(jouerSon("piece")).toBe(false);
    document.documentElement.setAttribute("data-sons", "non");
    expect(jouerSon("coffre")).toBe(false);
    expect(contextes).toHaveLength(0);
  });

  it("joue la pièce et le coffre une fois le réglage activé", async () => {
    const { jouerSon } = await charger();
    document.documentElement.setAttribute("data-sons", "oui");
    expect(jouerSon("piece")).toBe(true);
    expect(jouerSon("coffre")).toBe(true);
    // Un seul contexte, réutilisé : la pièce est faite de notes, le coffre
    // ajoute ses claquements.
    expect(contextes).toHaveLength(1);
    expect(contextes[0].oscillateurs).toBeGreaterThanOrEqual(4);
    expect(contextes[0].souffles).toBe(2);
  });

  it("ne double pas un son rejoué dans la foulée", async () => {
    vi.useFakeTimers();
    const { jouerSon } = await charger();
    document.documentElement.setAttribute("data-sons", "oui");
    expect(jouerSon("piece")).toBe(true);
    expect(jouerSon("piece")).toBe(false);
    vi.advanceTimersByTime(400);
    expect(jouerSon("piece")).toBe(true);
  });

  it("`force` donne l'aperçu au moment où l'on active le réglage", async () => {
    const { jouerSon } = await charger();
    expect(jouerSon("piece", { force: true })).toBe(true);
  });

  it("ignore un son inconnu et l'absence de Web Audio, sans erreur", async () => {
    const { jouerSon } = await charger();
    document.documentElement.setAttribute("data-sons", "oui");
    expect(jouerSon("klaxon")).toBe(false);
    delete window.AudioContext;
    const sansAudio = await charger();
    expect(sansAudio.jouerSon("piece")).toBe(false);
  });
});
