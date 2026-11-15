import { Pencil, RotateCcw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { Result } from "./Onboarding";

/** The client's profile as their advisor sees it: three measures, their situation, what to do first. Nothing technical. */
export default function Profile() {
  const { me, restart } = useApp();
  const nav = useNavigate();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => nav("/inscription")}><Pencil className="h-4 w-4" /> Ma situation a changé</Button>
      </div>
      <Result p={me!.profile} name={me!.profile.display_name} />
      {!me!.profile.kyc && (
        <div className="rounded-3xl bg-amber-50 p-5 text-sm text-amber-900">
          Votre profil a été créé avec l'ancien questionnaire, plus court. <button className="font-bold underline" onClick={() => nav("/inscription")}>Répondez au nouveau</button> pour des conseils plus justes.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm">
        <Link to="/a-propos" className="font-semibold text-brand-500">Comment ces calculs sont faits</Link>
        <button onClick={() => { if (confirm("Tout effacer (profil, objectifs, placements) et recommencer ?")) restart(); }} className="inline-flex items-center gap-1.5 font-semibold text-accent-700 hover:underline">
          <RotateCcw className="h-4 w-4" /> Tout effacer et recommencer
        </button>
      </div>
    </div>
  );
}
