import { expect, test } from "@playwright/test";

// Section 18 E2E: Robert -> tech-heavy portfolio -> X-Ray warning -> debate -> Supervisor -> scenario -> sources; then Amira for contrast.
test("Robert: X-Ray, debate with audited synthesis, scenario, sources", async ({ page }) => {
  await page.goto("/");
  await page.selectOption('[data-testid="persona-select"]', "robert");
  await page.selectOption('[data-testid="portfolio-select"]', "demo1_tech");

  await page.goto("/xray");
  await expect(page.getByTestId("xray")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Secteur Technologies de l'information : 55,0 % en détention directe").first()).toBeVisible();
  await expect(page.getByText("NVDA + MSFT = 55,0 % de la valeur").first()).toBeVisible();
  await expect(page.getByText("Chevauchement suspecté : QQQ et NVDA, MSFT")).toBeVisible();
  await expect(page.getByText("Dépassement").first()).toBeVisible();

  await page.goto("/debate");
  await page.getByLabel("Injecter une affirmation fabriquée (démonstration de l'audit)").check();
  await page.getByRole("button", { name: /Lancer le débat/ }).first().click();
  await expect(page.getByTestId("debate-result")).toBeVisible({ timeout: 280_000 });
  await expect(page.getByText("Superviseur – conclusion analytique")).toBeVisible();
  await expect(page.getByText("OPP-R1-INJ").first()).toBeVisible();            // fabricated claim visibly rejected
  await page.getByRole("button", { name: "Ouverture" }).first().click();       // opening round of the Opportunity agent
  await expect(page.getByText("✗ rejetée par l'audit").first()).toBeVisible();
  await expect(page.getByText(/identifiant\(s\) inexistant\(s\)/).first()).toBeVisible();
  await expect(page.getByText("Recherche Internet vs Données")).toBeVisible();

  await page.goto("/scenarios");
  await expect(page.getByText("Diversifié", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Effet sur le portefeuille")).toBeVisible();

  await page.goto("/sources");
  await expect(page.getByText("Niveaux de risque calculés pour chaque actif")).toBeVisible();
  await expect(page.getByText("Hypothèses pré-enregistrées – évaluation hors échantillon")).toBeVisible();
});

test("Amira vs Robert: same numbers, different budget result", async ({ page }) => {
  const read = async (persona: string) => {
    await page.goto("/xray");
    await page.selectOption('[data-testid="persona-select"]', persona);
    await page.selectOption('[data-testid="portfolio-select"]', "demo1_tech");
    await expect(page.getByTestId("xray")).toBeVisible({ timeout: 60_000 });
    const row = page.locator("tr", { hasText: "Perte max. historique (pondérations actuelles) vs seuil de revue" });
    await expect(row).toBeVisible();
    return { status: (await row.innerText()).includes("Dépassement") ? "BREACH" : "OK", vol: await page.getByText("annualisée, historique").locator("..").innerText() };
  };
  const robert = await read("robert");
  const amira = await read("amira");
  expect(robert.vol).toEqual(amira.vol);          // identical facts
  expect(robert.status).toBe("BREACH");           // -25,5 % vs Robert's -10 % review threshold
  expect(amira.status).toBe("OK");                // within Amira's -30 % threshold
});
