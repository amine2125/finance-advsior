import { expect, test } from "@playwright/test";

// Full user journey on a fresh browser profile: welcome → onboarding (bank-style questions) → recommended plan for the
// profile → invested → portfolio → « est-ce que tu me conseilles Tesla ? » → advisor bubble. Screenshots go to SHOTS.
const SHOTS = process.env.SHOTS || "test-results/shots";
const shot = (page: any, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

test("investor states a request, agents propose verified orders, risky request challenged", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Investir, avec quelqu'un")).toBeVisible();
  await shot(page, "01-welcome");
  // Accounts (Amazon Cognito): a fresh account each run, then straight to the questionnaire.
  await page.getByTestId("auth-mode").getByText("Créer un compte").click();
  await page.getByTestId("auth-email").fill(`e2e.${Date.now()}@exemple.ca`);
  await page.getByTestId("auth-password").fill("Parcours2026ok");
  await page.getByTestId("auth-submit").click();

  // « Connaître son client » : a bold tolerance but a thin cushion and a credit card balance.
  await page.getByTestId("name").fill("Sarah");
  await shot(page, "02-kyc-name");
  await page.getByTestId("next").click();
  await page.getByText("En couple", { exact: true }).click();
  await page.getByTestId("next").click();
  await page.getByText("Emploi permanent").click();
  await page.getByRole("button", { name: "Rester stable" }).click();
  await page.getByTestId("next").click();
  await page.getByTestId("income").fill("4000");
  await page.getByTestId("expenses").fill("3000");
  await shot(page, "03-kyc-budget");
  await page.getByTestId("next").click();
  await page.getByTestId("savings").fill("2000");
  await page.getByTestId("next").click();
  await page.getByTestId("cc").fill("1500");
  await page.getByRole("button", { name: "Non", exact: true }).click();
  await page.getByTestId("next").click();
  await page.getByTestId("investments").fill("0");
  await page.getByTestId("next").click();
  await page.getByText("De base").click();
  await page.getByRole("button", { name: "FNB" }).click();
  await page.getByTestId("next").click();
  await page.getByTestId("quiz_diversification-b").click();
  await shot(page, "04-kyc-quiz");
  await page.getByTestId("next").click();
  await page.getByTestId("quiz_bonds-b").click();
  await page.getByTestId("next").click();
  await page.getByTestId("quiz_inflation-c").click();
  await page.getByTestId("next").click();
  await page.getByText("Le faire croître à long terme").click();
  await page.getByTestId("next").click();
  await page.getByText("Dans plus de 12 ans").click();
  await page.getByRole("button", { name: "Peu probable" }).click();
  await page.getByTestId("next").click();
  await page.getByTestId("portfolio-D").click();
  await shot(page, "05-kyc-portfolios");
  await page.getByTestId("next").click();
  await page.getByText("−45 %").click();
  await page.getByTestId("next").click();
  await page.getByText("50 % de chances").click();
  await page.getByTestId("next").click();
  await page.getByText("J'en profite pour investir davantage").click();
  await page.getByTestId("next").click();
  await page.getByText("Serein(e), c'est normal").click();
  await page.getByTestId("next").click();
  await page.getByText("Je n'avais pas de placements").click();
  await page.getByTestId("next").click();
  await page.getByRole("button", { name: "Non", exact: true }).click();
  await page.getByTestId("next").click();

  // Bold on paper, but the situation sets the limit, and the advisor says what to do first.
  await expect(page.getByTestId("kyc-result")).toContainText("Profil prudent", { timeout: 30_000 });
  await expect(page.getByTestId("kyc-result")).toContainText("Remboursez d'abord votre carte de crédit");
  await shot(page, "06-kyc-result");
  await page.getByTestId("confirm").click();

  // The agentic mandate: the user states what they want, the agents work in front of them, then a verified proposal.
  await expect(page.getByTestId("mandate-input")).toBeVisible({ timeout: 30_000 });
  await shot(page, "07-mandate-home");
  await page.getByTestId("mandate-input").fill("J'ai 5 000 $ à investir");
  await page.getByTestId("mandate-start").click();
  await expect(page.getByTestId("pipeline")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await shot(page, "08-agents-working");
  await expect(page.getByTestId("proposal")).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId("headline")).toContainText("5 000 $");
  await page.getByTestId("open-analysis").click();
  await page.getByRole("button", { name: /^Contrôles/ }).click();
  await expect(page.getByTestId("governance")).toContainText("Remboursez d'abord votre carte de crédit");
  await shot(page, "09-proposal");
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("approved")).toBeVisible({ timeout: 30_000 });

  // A request that does not fit the profile is challenged, not executed.
  await page.goto("/");
  await page.getByTestId("mandate-input").fill("Je veux mettre 3 000 $ dans Tesla");
  await page.getByTestId("mandate-start").click();
  await expect(page.getByTestId("proposal")).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId("headline")).toContainText("Je ne vous le conseille pas");
  await shot(page, "10-proposal-refused");

  await page.goto("/placements");
  await expect(page.getByTestId("holdings-list")).toBeVisible({ timeout: 60_000 });
  await shot(page, "11-holdings");

  await page.goto("/");
  await page.getByTestId("advisor-open").click();
  await expect(page.getByTestId("advisor-panel")).toBeVisible();
  await shot(page, "12-advisor");

  await page.goto("/profil");
  await shot(page, "13-profile");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("mandate-input")).toBeVisible({ timeout: 30_000 });
  await shot(page, "14-mobile-home");

  // Sign out: back to the sign-in screen, nothing of the account is reachable any more.
  await page.goto("/profil");
  await page.getByTestId("profile-sign-out").click();
  await expect(page.getByTestId("auth-form")).toBeVisible();
});
