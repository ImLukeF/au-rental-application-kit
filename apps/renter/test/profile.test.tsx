import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { BrowserRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import { App } from "../src/main";
import { Vault } from "../src/vault";

afterEach(async () => {
  cleanup();
  await Vault.wipe();
});
it("opens a labelled profile after vault creation", async () => {
  history.replaceState({}, "", "/unlock");
  const { container } = render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
  fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "correct horse battery" } });
  fireEvent.click(screen.getByRole("button", { name: "Create vault" }));
  await screen.findByRole("heading", { name: "Your profile" });
  expect(screen.getByLabelText("Full name")).toBeTruthy();
  const income = screen.getByLabelText("Net weekly income (dollars)") as HTMLInputElement;
  fireEvent.change(income, { target: { value: "1000" } });
  expect(income.value).toBe("1000");
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await screen.findByText("Profile saved on this device.");
  const stored = await (await Vault.unlock("correct horse battery")).get<{
    employment: { netWeeklyIncomeCents: number };
  }>("records", "profile");
  expect(stored?.employment.netWeeklyIncomeCents).toBe(100000);
  expect(income.value).toBe("1000");
  expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual(
    [],
  );
});
