import { rulesVersion } from "@aurak/rules";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import React from "react";
import { BrowserRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import rawListing from "../../../fixtures/listings/vic-listing.json";
import profile from "../../../fixtures/profiles/vic-employed.json";
import { Apply } from "../src/main";

function Wrapper({ vault, docs }: { vault: any; docs: any[] }) {
  const [item, setItem] = React.useState<any>(null);
  return (
    <BrowserRouter>
      <Apply
        vault={vault}
        profile={profile}
        docs={docs}
        listing={item}
        setListing={setItem}
        run={async (fn: () => Promise<void>) => {
          await fn();
        }}
        setMessage={() => {}}
      />
    </BrowserRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("reviews excluded information and submits only the selected documents", async () => {
  const listing = { ...rawListing, rulesVersion: rulesVersion() };
  const docs = ["payslip", "bank_statement_no_transactions"].map((type, i) => ({
    docId: `doc${i}`,
    type,
    filename: `sample-${i}.pdf`,
    sha256: "a".repeat(64),
    byteLength: 100,
    contentType: "application/pdf",
  }));
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(listing), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          applicationId: "fixture",
          portalPath: "/my-application#id=fixture&t=fixture",
          receipt: {},
        }),
        { status: 201 },
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  const vault = {
    document: vi.fn().mockResolvedValue(new Uint8Array([1])),
    put: vi.fn(),
    assertUnlocked: vi.fn(),
  };
  const { container } = render(<Wrapper vault={vault} docs={docs} />);
  fireEvent.change(screen.getByLabelText("Apply link"), {
    target: { value: "https://example.test/apply/abcdefghijkl" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Load listing" }));
  await screen.findByText("Not shared");
  expect(screen.getByText("References not requested.")).toBeTruthy();
  fireEvent.click(screen.getByLabelText(/sample-0.pdf/));
  fireEvent.click(screen.getByLabelText(/sample-1.pdf/));
  fireEvent.click(screen.getByLabelText(/I am giving this application/));
  fireEvent.click(screen.getByRole("button", { name: "Generate group code" }));
  expect((screen.getByLabelText("Group code (optional)") as HTMLInputElement).value).toMatch(/^[A-Z2-7]{8}$/);
  fireEvent.change(screen.getByLabelText("Type your full name"), { target: { value: "Test Applicant One" } });
  expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual(
    [],
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const body = fetchMock.mock.calls[1]![1].body as FormData;
  const sent = JSON.parse(String(body.get("application")));
  expect(sent.payload.applicant.item9).toBeNull();
  expect(sent.groupCode).toMatch(/^[A-Z2-7]{8}$/);
  expect(sent.consents[0]).not.toHaveProperty("at");
  expect(body.get("doc_0")).toBeTruthy();
  expect(body.get("doc_1")).toBeTruthy();
});
