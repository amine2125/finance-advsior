import { Pencil, RotateCcw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PageIn } from "../components/motion";
import { Button } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { Result } from "./Onboarding";

/** The client's profile as their advisor sees it: the level, why, what to do first, their situation. Nothing technical. */
export default function Profile() {
  const { me, restart } = useApp();
  const nav = useNavigate();
  return (
    <PageIn className="mx-auto max-w-3xl px-5 pb-16 pt-8">
      <Result p={me!.profile} name={me!.profile.display_name}
        action={<Button variant="secondary" size="sm" onClick={() => nav("/inscription")}><Pencil className="h-4 w-4" /> Ma situation a changé</Button>} />
      {!me!.profile.kyc && (
        <div className="mt-6 rounded-[20px] bg-primary-50 p-5 text-sm text-ink">
          Votre profil a été créé avec l'ancien questionnaire, plus court. <button className="font-semibold underline" onClick={() => nav("/inscription")}>Répondez au nouveau</button> pour des conseils plus justes.
        </div>
      )}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm">
        <Link to="/a-propos" className="font-medium text-ink-soft hover:text-ink">Comment ces calculs sont faits</Link>
        <button onClick={() => { if (confirm("Tout effacer (profil, objectifs, placements) et recommencer ?")) restart(); }} className="inline-flex items-center gap-1.5 font-medium text-accent-700 hover:underline">
          <RotateCcw className="h-4 w-4" /> Tout effacer et recommencer
        </button>
      </div>
    </PageIn>
  );
}
