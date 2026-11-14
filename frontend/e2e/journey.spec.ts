import { expect, test } from "@playwright/test";

// Full user journey on a fresh browser profile: welcome → onboarding (bank-style questions) → own holdings → portfolio
// analysis → « Investir » verdict for the profile. Screenshots go to SHOTS (default: test-results/shots).
const SHOTS = process.env.SHOTS || "test-results/shots";
const shot = (page: any, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

test("cautious investor: onboarding, portfolio check, risky asset refused with reasons", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Investissons plus sereinement.")).toBeVisible();
  await shot(page, "01-welcome");
  await page.getByTestId("start").click();

  await page.getByTestId("name").fill("Sarah");
  await shot(page, "02-onboarding-name");
  await page.getByTestId("next").click();
  await page.getByText("Le protéger avec un peu de croissance").click();
  await shot(page, "03-onboarding-objective");
  await page.getByTestId("next").click();
  await page.getByText("3 à 7 ans").click();
  await page.getByTestId("next").click();
  await page.getByText("−10 %").click();
  await shot(page, "04-onboarding-decline");
  await page.getByTestId("next").click();
  await page.getByText("J'attends que ça remonte").click();
  await page.getByTestId("next").click();
  await shot(page, "05-onboarding-situation");
  await page.getByTestId("next").click();
  await page.getByRole("button", { name: "Non", exact: true }).first().click();
  await page.getByTestId("next").click();

  await expect(page.getByText("Pourquoi ce niveau ?")).toBeVisible();
  await shot(page, "06-onboarding-profile");
  await page.getByTestId("confirm").click();

  await page.getByText("Oui, je les ajoute").click();
  for (const [q, id] of [["XBB", "XBB.TO"], ["XIU", "XIU.TO"], ["SPY", "SPY"]]) {
    await page.getByTestId("asset-search").fill(q);
    await page.getByRole("button", { name: new RegExp(`^${id.replace(".", "\\.")}`) }).first().click();
  }
  await shot(page, "07-onboarding-holdings");
  await page.getByTestId("save-holdings").click();

  await expect(page.getByTestId("analysis")).toBeVisible({ timeout: 60_000 });
  await shot(page, "08-portfolio");

  await page.goto("/");
  await expect(page.getByText("Vos limites respectées")).toBeVisible({ timeout: 30_000 });
  await shot(page, "09-home");

  await page.goto("/investir");
  await expect(page.getByRole("heading", { name: "Adaptés à votre profil" })).toBeVisible({ timeout: 30_000 });
  await shot(page, "10-invest");
  await page.getByTestId("invest-search").fill("TSLA");
  await page.getByRole("button", { name: /^TSLA/ }).first().click();
  await page.getByTestId("invest-amount").fill("5000");
  await page.getByTestId("invest-check").click();
  await expect(page.getByTestId("verdict")).toContainText("Non, ce placement n'est pas adapté à votre profil", { timeout: 60_000 });
  await shot(page, "11-verdict-no");

  await page.goto("/assistant");
  await shot(page, "12-assistant");
  await page.goto("/profil");
  await shot(page, "13-profile");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Vos limites respectées")).toBeVisible({ timeout: 30_000 });
  await shot(page, "14-mobile-home");
});
