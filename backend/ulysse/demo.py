"""Demo mode: put the app back in a known state (reproducible scenarios, PDF deliverable 2)."""
from __future__ import annotations

from ulysse.personas import LISTES_SURVEILLANCE, all_personas
from ulysse.store import now_iso



def reset(store) -> dict:
    store.wipe()
    for pid, (prof, con) in all_personas().items():
        store.put("profils", pid, prof.model_dump())
        store.put("contrats", pid, con.model_dump())
        store.put("contrats_versions", f"{pid}-v{con.version}", con.model_dump())
        store.put("surveillance", pid, LISTES_SURVEILLANCE.get(pid, []))
        store.append("journal", pid, {"type": "contrat", "a": now_iso(), "version": con.version, "message": "Contrat créé (profil pré-rempli)."})
    return {"profils": list(all_personas()), "reinitialise_le": now_iso()}
