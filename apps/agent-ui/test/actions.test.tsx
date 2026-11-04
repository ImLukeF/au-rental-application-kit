import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { Application, CloseListing, Listing, Settings } from "../src/main";

afterEach(cleanup);
it("offers only transitions the server allows", () => {
  render(
    <Application
      id="example"
      data={{ status: "preferred", allowedTransitions: ["id_requested", "unsuccessful"], documents: [] }}
      action={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Mark id requested" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Mark successful" })).toBeNull();
});
it("previews the Victorian legal retention deadline when closing a leased listing", () => {
  render(<CloseListing data={{ id: "example", jurisdiction: "VIC" }} action={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Agreement date"), { target: { value: "2026-11-10" } });
  expect(screen.getByText(/2026-12-10/)).toBeTruthy();
});

it("enforces the retention policy caps in the settings form", () => {
  render(
    <Settings
      data={{
        details: {},
        retentionPolicy: { unsuccessfulDays: 14, withdrawnDays: 2, identityDocMaxDays: 7 },
      }}
      action={vi.fn()}
    />,
  );
  const input = screen.getByLabelText("unsuccessful Days") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "29" } });
  expect(input.validity.rangeOverflow).toBe(true);
});

it("marks selected applications unsuccessful and reloads the list", async () => {
  const item = {
    id: "fixture-app",
    status: "submitted",
    submittedAt: "2026-11-04T00:00:00Z",
    payload: { jurisdiction: "VIC", applicant: { item4: { fullName: "Test Applicant One" } } },
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [item], cursor: null }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: "unsuccessful" }), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ ...item, status: "unsuccessful" }], cursor: null }), {
        status: 200,
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <BrowserRouter>
      <Listing
        data={{
          id: "fixture",
          status: "open",
          jurisdiction: "VIC",
          item1: { premisesAddress: "0 Placeholder Crescent, Fixtureville" },
        }}
        action={vi.fn()}
      />
    </BrowserRouter>,
  );
  fireEvent.click(await screen.findByRole("checkbox", { name: "Select application" }));
  fireEvent.click(screen.getByRole("button", { name: "Mark selected unsuccessful" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(screen.getByRole("link", { name: "Test Applicant One" }).closest("li")?.textContent).toContain(
    "unsuccessful",
  );
  vi.unstubAllGlobals();
});
