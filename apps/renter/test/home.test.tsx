import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { BrowserRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import { App } from "../src/main";

afterEach(cleanup);
it("offers vault creation with a clear privacy statement and no basic accessibility violations", async () => {
  const { container } = render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
  expect(screen.getByText(/your information stays on this device/i)).toBeTruthy();
  expect(screen.getByRole("link", { name: /create vault/i })).toBeTruthy();
  const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(result.violations).toEqual([]);
});
