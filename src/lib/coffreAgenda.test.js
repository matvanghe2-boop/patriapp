import { describe, it, expect } from "vitest";
import { evenementAgenda, lienGoogleAgenda, fichierIcs, plierLigne, etatAgenda, marquerAgenda } from "./coffreAgenda";

const AUJOURDHUI = "2026-11-02";
const doc = (champs) => ({ id: "d1", type: "autre", titre: "Doc", fichiers: [], notes: "", recurrence: null, ...champs });
const passeport = doc({ type: "passeport", titre: "Passeport", echeance: "2031-03-11", notes: "n° 12AB34567" });

describe("evenementAgenda", () => {
  it("pose le rappel à la date où agir, avec l'action et l'échéance dans le titre", () => {
    const evt = evenementAgenda(passeport, {}, { aujourdhui: AUJOURDHUI });
    expect(evt).toMatchObject({
      uid: "coffre-d1@patrium",
      cible: "2030-11-11",
      date: "2030-11-11",
      titre: "Passeport — lancer le renouvellement (échéance le 11/03/2031)",
      annuel: false,
    });
    expect(JSON.stringify(evt)).not.toContain("12AB");
  });

  it("ramène à aujourd'hui un rappel déjà passé, sans changer la date cible", () => {
    const evt = evenementAgenda(doc({ type: "passeport", echeance: "2027-01-15" }), {}, { aujourdhui: AUJOURDHUI });
    expect(evt.cible).toBe("2026-09-17");
    expect(evt.date).toBe(AUJOURDHUI);
  });

  it("répète chaque année le rappel d'un contrat reconduit", () => {
    const contrat = doc({ type: "contrat_assurance", titre: "Mutuelle", echeance: "2027-01-01", recurrence: "annuelle" });
    const evt = evenementAgenda(contrat, {}, { aujourdhui: AUJOURDHUI });
    expect(evt).toMatchObject({ date: "2026-11-02", cible: "2026-11-02", annuel: true });
    expect(evt.titre).toBe("Mutuelle — comparer avant la reconduction (échéance chaque année le 01/01)");
  });

  it("suit le préavis d'un contrat lié à Abonnements", () => {
    const papier = doc({ type: "contrat_assurance", titre: "Habitation", contratId: "c1", recurrence: "annuelle" });
    const contrat = { id: "c1", date_fin: "2027-03-01", preavis_jours: 30 };
    const evt = evenementAgenda(papier, {}, { aujourdhui: AUJOURDHUI, contrat });
    expect(evt).toMatchObject({ date: "2027-01-30", annuel: false });
    expect(evt.titre).toBe("Habitation — dernier jour pour résilier (échéance le 01/03/2027)");
  });

  it("met un titre neutre quand le réglage le demande", () => {
    const evt = evenementAgenda(passeport, { titreAgendaNeutre: true }, { aujourdhui: AUJOURDHUI });
    expect(evt.titre).toBe("Papier à renouveler — voir le coffre Patrium");
  });

  it("ne rappelle rien sans échéance, ni pour un papier déjà échu", () => {
    expect(evenementAgenda(doc({ type: "diplome" }), {}, { aujourdhui: AUJOURDHUI })).toBeNull();
    expect(evenementAgenda(doc({ type: "facture", echeance: "2026-10-01" }), {}, { aujourdhui: AUJOURDHUI })).toBeNull();
  });
});

describe("lienGoogleAgenda", () => {
  it("ouvre un événement d'une journée pré-rempli", () => {
    const url = new URL(lienGoogleAgenda(evenementAgenda(passeport, {}, { aujourdhui: AUJOURDHUI })));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20301111/20301112");
    expect(url.searchParams.get("text")).toBe("Passeport — lancer le renouvellement (échéance le 11/03/2031)");
    expect(url.searchParams.get("recur")).toBeNull();
  });

  it("ajoute la règle annuelle d'un contrat reconduit", () => {
    const contrat = doc({ type: "contrat_assurance", echeance: "2027-01-01", recurrence: "annuelle" });
    const url = new URL(lienGoogleAgenda(evenementAgenda(contrat, {}, { aujourdhui: AUJOURDHUI })));
    expect(url.searchParams.get("recur")).toBe("RRULE:FREQ=YEARLY");
  });
});

describe("fichierIcs", () => {
  const maintenant = new Date("2026-11-02T10:30:00.000Z");

  it("produit un calendrier conforme : CRLF, dates sur une journée, alarme, règle annuelle", () => {
    const evts = [
      evenementAgenda(passeport, {}, { aujourdhui: AUJOURDHUI }),
      evenementAgenda(doc({ id: "d2", type: "contrat_assurance", titre: "Mutuelle", echeance: "2027-01-01", recurrence: "annuelle" }), {}, { aujourdhui: AUJOURDHUI }),
    ];
    const ics = fichierIcs(evts, maintenant);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:coffre-d1@patrium");
    expect(ics).toContain("DTSTAMP:20261102T103000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20301111\r\nDTEND;VALUE=DATE:20301112");
    expect(ics.match(/RRULE:FREQ=YEARLY/g)).toHaveLength(1);
    expect(ics.match(/TRIGGER:PT9H/g)).toHaveLength(2);
  });

  it("échappe les virgules et points-virgules, et ne coupe jamais une ligne au-delà de 75 octets", () => {
    const evt = {
      ...evenementAgenda(passeport, {}, { aujourdhui: AUJOURDHUI }),
      titre: "Été, à l'étranger; « très » long titre accentué qui dépasse largement la limite de soixante-quinze octets",
    };
    const ics = fichierIcs([evt], maintenant);
    const encodeur = new TextEncoder();
    for (const ligne of ics.split("\r\n")) expect(encodeur.encode(ligne).length).toBeLessThanOrEqual(75);
    const deplie = ics.replace(/\r\n /g, "");
    expect(deplie).toContain("SUMMARY:Été\\, à l'étranger\\; « très » long titre");
  });

  it("plie sans couper un caractère accentué en deux", () => {
    const ligne = `SUMMARY:${"é".repeat(60)}`;
    const plie = plierLigne(ligne);
    expect(plie.split("\r\n ").join("")).toBe(ligne);
    expect(plie).not.toContain("�");
  });
});

describe("suivi de l'agenda", () => {
  it("sait si le rappel posé correspond encore au document", () => {
    const evt = evenementAgenda(passeport, {}, { aujourdhui: AUJOURDHUI });
    expect(etatAgenda(passeport, evt)).toBe("absent");
    const pose = marquerAgenda(passeport, evt, "2026-11-02T10:00:00.000Z");
    expect(pose.agendaAjouteLe).toBe("2026-11-02T10:00:00.000Z");
    expect(etatAgenda(pose, evt)).toBe("a_jour");

    const prolonge = { ...pose, echeance: "2036-03-11" };
    expect(etatAgenda(prolonge, evenementAgenda(prolonge, {}, { aujourdhui: AUJOURDHUI }))).toBe("a_mettre_a_jour");
    expect(etatAgenda(pose, evenementAgenda(pose, { titreAgendaNeutre: true }, { aujourdhui: AUJOURDHUI }))).toBe(
      "a_mettre_a_jour"
    );
    expect(etatAgenda(pose, null)).toBe("sans_objet");
  });

  it("garde à jour un rappel annuel d'une année sur l'autre", () => {
    const contrat = doc({ type: "contrat_assurance", echeance: "2027-01-01", recurrence: "annuelle" });
    const pose = marquerAgenda(contrat, evenementAgenda(contrat, {}, { aujourdhui: AUJOURDHUI }));
    const lAnneeSuivante = evenementAgenda(pose, {}, { aujourdhui: "2027-06-01" });
    expect(lAnneeSuivante.cible).toBe("2027-11-02");
    expect(etatAgenda(pose, lAnneeSuivante)).toBe("a_jour");
  });
});
