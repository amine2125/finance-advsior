export type Niveau = "aucun" | "ok" | "attention" | "pause";
export type Statut = "respectee" | "approchee" | "depassee" | "donnees_insuffisantes" | "non_applicable";
export interface Preuve {
  id: string; mesure: string; libelle: string; sujet: string; valeur: any; unite: string; devise: string | null;
  periode: { debut: string; fin: string } | null; as_of: string; date_de_calcul: string; donnees_source: string[];
  methode: string; parametres: Record<string, unknown>; version_du_code: string; statut: "ok" | "donnees_insuffisantes" | "non_applicable";
  note: string | null; reference: string | null; affichage?: Record<string, string>;
}
export interface StatutClause {
  clause_id: string; type: string; libelle: string; origine: "dit" | "defaut"; importante: boolean; statut: Statut;
  valeur_avant: number | null; valeur_apres: number | null; limite: number | null; unite: string; explication: string;
  preuves: string[]; incertain: boolean; cause_par_intention: boolean; deja_depassee_avant: boolean;
}
export interface Option { code: string; libelle: string; details: Record<string, any>; preuves: string[] }
export interface Signal {
  niveau: Niveau; afficher: boolean; mode: "aucun" | "discret" | "encadre" | "interruption"; gravite: number; titre: string;
  regles_declenchees: string[]; clauses: StatutClause[]; options: Option[]; preuves: Preuve[]; as_of: string; latence_ms: number | null;
}
export interface Clause { id: string; type: string; parametres: Record<string, any>; libelle: string; origine: "dit" | "defaut"; justification: string | null; importante: boolean }
export interface Contrat { profil_id: string; version: number; cree_le: string; clauses: Clause[]; historique: any[] }
export interface Profil {
  id: string; nom: string; age: number | null; experience: "debutant" | "intermediaire" | "avance"; tolerance: string; description: string;
  objectifs: { id: string; libelle: string; horizon_annees: number; part_pct: number; montant_cible_cad: number | null }[];
  preferences: { esg_important: boolean; interet_crypto: boolean; interet_techno: boolean; notifications_min: string };
  allocation: { capital_cad: number; poids: Record<string, number>; constitue_le: string }; fictif: boolean; kyc?: Kyc | null;
}
export interface Kyc {
  tolerance_retenue: string; niveau: string; mesure_determinante: string; raisons: string[]; ecart: string | null; cadre: string; crypto_permise: boolean;
  tolerance: { niveau: string; raisons: string[]; contradiction: boolean; note: string | null };
  capacite: { niveau: string; raisons: string[]; situation: { mois_epargne: number | null; marge_mensuelle: number | null; dettes_cad: number } };
  connaissances: { niveau: string; quiz_bonnes: number; quiz_total: number };
  avant_d_investir: { type: string; titre: string; texte: string; montant_cad?: number }[];
}
export interface Adaptation {
  vocabulaire: "simple" | "standard" | "detaille"; densite: string; metriques_detaillees_visibles: boolean; glossaire_proactif: boolean;
  lentille_esg: boolean; module_crypto: "visible" | "replie"; priorite_modules: string[]; horizon_le_plus_proche_annees: number;
  raisons: Record<string, string>;
}
export interface Actif { ticker: string; name: string; asset_class: string; market: string; currency: string; sector: string; first_date: string }
