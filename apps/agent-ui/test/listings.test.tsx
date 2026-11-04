import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { BrowserRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../src/main";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows listings returned by the agency API", async () => {
  history.replaceState({}, "", "/agent/listings");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            { id: "example", premisesAddress: "Example premises", jurisdiction: "VIC", status: "open" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  const { container } = render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
  expect(await screen.findByRole("link", { name: "Example premises" })).toBeTruthy();
  expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual(
    [],
  );
});
