import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const poserQuestion = vi.fn();
vi.mock("../lib/horizonClient", () => ({
  poserQuestion: (...a) => poserQuestion(...a),
  pointsVersEuros: (p, f) => p * f,
}));

import AssistantHorizon from "./AssistantHorizon";

const CONTEXTE = { version: 1, base: 100, allocationPct: { actions: 60 } };

beforeEach(() => {
  poserQuestion.mockReset();
});

const rendre = () => render(<AssistantHorizon contexte={CONTEXTE} facteurBase100={720} />);

describe("AssistantHorizon", () => {
  it("propose des suggestions tant qu'aucune question n'a été posée", () => {
    rendre();
    expect(screen.getByText(/Quel serait l'impact d'une voiture/)).toBeInTheDocument();
  });

  it("rappelle le taux de conversion des points en euros", () => {
    rendre();
    // Le modèle raisonne en base 100 : sans ce repère, la réponse est illisible.
    expect(screen.getByText(/1 point =/)).toBeInTheDocument();
  });

  it("envoie la question avec le contexte anonymisé et affiche la réponse", async () => {
    poserQuestion.mockResolvedValue({ type: "texte", contenu: "Retard de 7 mois.", journal: [], fournisseur: "gemini" });
    const user = userEvent.setup();
    rendre();

    await user.type(screen.getByLabelText(/Question à l'assistant/), "Et si j'achète une voiture ?");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    expect(poserQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ question: "Et si j'achète une voiture ?", contexte: CONTEXTE })
    );
    expect(await screen.findByText("Retard de 7 mois.")).toBeInTheDocument();
  });

  it("affiche la question de l'utilisateur dans le fil", async () => {
    poserQuestion.mockResolvedValue({ type: "texte", contenu: "ok", journal: [] });
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByText(/Vaut-il mieux acheter comptant/));
    expect(await screen.findByText(/Vaut-il mieux acheter comptant/)).toBeInTheDocument();
  });

  it("indique quel fournisseur a répondu", async () => {
    poserQuestion.mockResolvedValue({ type: "texte", contenu: "ok", journal: [], fournisseur: "groq" });
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByText(/Combien dois-je épargner/));
    expect(await screen.findByText(/Réponse générée par groq/)).toBeInTheDocument();
  });

  it("expose le journal des calculs, replié par défaut", async () => {
    poserQuestion.mockResolvedValue({
      type: "texte",
      contenu: "Verdict.",
      journal: [{ outil: "lire_contexte", entrees: {}, sorties: { base: 100 } }],
    });
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByText(/Combien dois-je épargner/));

    const bascule = await screen.findByText(/Journal des calculs \(1 appel\)/);
    expect(screen.queryByText("lire_contexte")).not.toBeInTheDocument();
    await user.click(bascule);
    expect(screen.getByText("lire_contexte")).toBeInTheDocument();
  });

  it("affiche une question du modèle et ses options cliquables", async () => {
    poserQuestion.mockResolvedValue({
      type: "question",
      question: { question: "Quel taux de crédit ?", options: ["3,5 %", "4,2 %"] },
      historique: [],
    });
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByText(/Combien dois-je épargner/));

    expect(await screen.findByText("Information manquante")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4,2 %" })).toBeInTheDocument();
  });

  it("relance la boucle quand une option est choisie", async () => {
    poserQuestion
      .mockResolvedValueOnce({ type: "question", question: { question: "Quel taux ?", options: ["4,2 %"] }, historique: [] })
      .mockResolvedValueOnce({ type: "texte", contenu: "Merci, voici le verdict.", journal: [] });
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByText(/Combien dois-je épargner/));
    await user.click(await screen.findByRole("button", { name: "4,2 %" }));

    expect(await screen.findByText("Merci, voici le verdict.")).toBeInTheDocument();
    expect(poserQuestion).toHaveBeenCalledTimes(2);
  });

  it("s'efface en mode dégradé et renvoie vers les formulaires", async () => {
    poserQuestion.mockResolvedValue({ modeDegrade: true, erreur: "Aucun fournisseur gratuit disponible." });
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByText(/Combien dois-je épargner/));

    expect(await screen.findByText("Assistant indisponible")).toBeInTheDocument();
    expect(screen.getByText(/mêmes calculs/)).toBeInTheDocument();
    // La zone de saisie disparaît : rien ne laisse croire que l'assistant répond.
    expect(screen.queryByLabelText(/Question à l'assistant/)).not.toBeInTheDocument();
  });

  it("affiche une erreur sans casser le fil", async () => {
    poserQuestion.mockResolvedValue({ erreur: "L'assistant n'a pas pu répondre." });
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByText(/Combien dois-je épargner/));

    expect(await screen.findByText("L'assistant n'a pas pu répondre.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Question à l'assistant/)).toBeInTheDocument();
  });

  it("signale un raisonnement interrompu au plafond d'itérations", async () => {
    poserQuestion.mockResolvedValue({ type: "texte", contenu: "Partiel.", journal: [], plafondAtteint: true });
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByText(/Combien dois-je épargner/));
    expect(await screen.findByText(/nombre d'étapes maximal atteint/)).toBeInTheDocument();
  });

  it("n'envoie pas une saisie vide", async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole("button", { name: /envoyer/i }));
    expect(poserQuestion).not.toHaveBeenCalled();
  });

  it("rappelle que les chiffres viennent du moteur, pas du modèle", () => {
    rendre();
    expect(screen.getByText(/jamais du modèle/)).toBeInTheDocument();
  });
});
