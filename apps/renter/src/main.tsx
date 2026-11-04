// biome-ignore-all lint/suspicious/noArrayIndexKey: Form rows are controlled by their parent and have no persisted row IDs.
import {
  buildPayload,
  CONSENTS,
  consentText,
  DISCLAIMER,
  documentRefs,
  exportApplicationJson,
  NSW_PROVISIONAL_BANNER,
} from "@aurak/forms";
import { renderApplicationPdf } from "@aurak/pdf";
import {
  listRules,
  localToday,
  NSW_FINANCIAL,
  NSW_IDENTITY,
  ruleStatus,
  rulesVersion,
  VIC_FINANCIAL,
  VIC_IDENTITY,
} from "@aurak/rules";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, useLocation, useNavigate } from "react-router";
import { Vault } from "./vault";
import "./style.css";

const today = () => localToday();
const label = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
const blank = () => ({
  personal: { fullName: "", dateOfBirth: "", phone: "", email: "" },
  addresses: [
    {
      address: "",
      postcode: "",
      from: "",
      to: "",
      providerName: "",
      providerEmail: "",
      providerPhone: "",
      isCurrent: true,
    },
  ],
  employment: { status: "employed", employer: "", employerAddress: "", netWeeklyIncomeCents: 0, endedOn: "" },
  noRegularIncomeDetails: "",
  referees: [],
  preferences: { desiredLeaseTerm: "", preferredMoveInDate: "" },
  occupantsDefault: 1,
});
function download(data: BlobPart, name: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App() {
  const [vault, setVault] = useState<Vault | null>(null),
    [exists, setExists] = useState(false),
    [message, setMessage] = useState(""),
    [profile, setProfile] = useState<any>(blank()),
    [docs, setDocs] = useState<any[]>([]),
    [listing, setListing] = useState<any>(null),
    [history, setHistory] = useState<any[]>([]);
  const location = useLocation(),
    nav = useNavigate();
  const path = location.pathname;
  const lockGeneration = useRef(0);
  const lock = useCallback(() => {
    lockGeneration.current++;
    vault?.lock();
    setVault(null);
    setProfile(blank());
    setDocs([]);
    setHistory([]);
    setListing(null);
  }, [vault]);
  useEffect(() => {
    if (!vault) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          lock();
          setMessage("Vault locked after inactivity.");
        },
        Math.max(1, Number(localStorage.getItem("aurak-lock-minutes") || 15)) * 60000,
      );
    };
    const events = ["pointerdown", "keydown"];
    events.forEach((e) => {
      window.addEventListener(e, reset);
    });
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => {
        window.removeEventListener(e, reset);
      });
    };
  }, [vault, lock]);
  useEffect(() => {
    Vault.exists().then(setExists);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reload encrypted history after submission navigation.
  useEffect(() => {
    if (!vault) return;
    let active = true;
    const generation = lockGeneration.current;
    vault
      .get("records", "profile")
      .then((v) => {
        if (active && generation === lockGeneration.current && v) setProfile(v);
      })
      .catch(() => {});
    vault
      .documents()
      .then((v) => {
        if (active && generation === lockGeneration.current) setDocs(v);
      })
      .catch(() => {});
    vault
      .list("submissions")
      .then((v) => {
        if (active && generation === lockGeneration.current) setHistory(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [vault, location.pathname]);
  const run = async (fn: () => Promise<void>) => {
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  };
  const set = (group: string, key: string, value: any) =>
    setProfile((p: any) => ({ ...p, [group]: { ...p[group], [key]: value } }));
  const save = () =>
    run(async () => {
      const cleaned = JSON.parse(JSON.stringify(profile, (_k, v) => (v === "" ? undefined : v)));
      await vault!.put("records", "profile", cleaned);
      vault!.assertUnlocked();
      setProfile(cleaned);
      setMessage("Profile saved on this device.");
    });
  const fields = (group: string, defs: [string, string, string?][]) =>
    defs.map(([key, title, type]) => (
      <label key={key}>
        {title}
        <input
          type={type || "text"}
          value={profile[group][key] ?? ""}
          onChange={(e) =>
            set(
              group,
              key,
              key === "netWeeklyIncomeCents" ? Math.round(Number(e.target.value) * 100) : e.target.value,
            )
          }
        />
      </label>
    ));
  let page: React.ReactNode;
  if (path === "/")
    page = (
      <>
        <h1>Your rental application, on your terms.</h1>
        <p>
          Your information stays on this device. Build a reusable profile, choose what to share, and export an
          application.
        </p>
        <Link className="button" to="/unlock">
          {exists ? "Unlock vault" : "Create vault"}
        </Link>
      </>
    );
  else if (path === "/unlock")
    page = (
      <>
        <h1>{exists ? "Unlock your vault" : "Create your vault"}</h1>
        <p>
          Use a passphrase of at least 12 characters. If you lose it, your data cannot be recovered. Browsers
          may clear local storage; keep an encrypted backup.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const p = new FormData(e.currentTarget).get("passphrase") as string;
            run(async () => {
              const v = exists ? await Vault.unlock(p) : await Vault.create(p);
              setVault(v);
              setExists(true);
              if (!exists && navigator.storage?.persist) {
                const persisted = await navigator.storage.persist();
                setMessage(
                  persisted
                    ? "Persistent storage granted."
                    : "Persistent storage was not granted; keep an encrypted backup.",
                );
              }
              nav("/profile");
            });
          }}
        >
          <label>
            Passphrase
            <input
              name="passphrase"
              type="password"
              minLength={12}
              required
              autoComplete={exists ? "current-password" : "new-password"}
            />
          </label>
          <button type="submit">{exists ? "Unlock" : "Create vault"}</button>
        </form>
      </>
    );
  else if (!vault && !["/legal", "/my-application"].includes(path))
    page = (
      <>
        <h1>Vault locked</h1>
        <p>Unlock your vault to continue.</p>
        <Link to="/unlock">Unlock vault</Link>
      </>
    );
  else if (path === "/profile")
    page = (
      <>
        <h1>Your profile</h1>
        <p>Your details are encrypted on this device. Only selected, permitted information is shared.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2>About you and contact</h2>
          <p>Used for VIC Form 3A item 4 / NSW applicant details.</p>
          <div className="grid">
            {fields("personal", [
              ["fullName", "Full name"],
              ["dateOfBirth", "Date of birth", "date"],
              ["phone", "Phone", "tel"],
              ["email", "Email", "email"],
            ])}
          </div>
          <h2>Address history</h2>
          <p>Used for VIC item 8 / NSW rental history. The first address is current.</p>
          {profile.addresses.map((a: any, i: number) => (
            <fieldset key={i}>
              <legend>Address {i + 1}</legend>
              <div className="grid">
                {(
                  [
                    ["address", "Address"],
                    ["postcode", "Postcode"],
                    ["from", "From", "date"],
                    ["to", "To", "date"],
                    ["providerName", "Rental provider or agent name"],
                    ["providerEmail", "Rental provider or agent email", "email"],
                    ["providerPhone", "Rental provider or agent phone", "tel"],
                  ] as [string, string, string?][]
                ).map(([key, title, type]) => (
                  <label key={key}>
                    {title}
                    <input
                      type={type || "text"}
                      value={a[key] || ""}
                      onChange={(e) =>
                        setProfile((p: any) => ({
                          ...p,
                          addresses: p.addresses.map((x: any, j: number) =>
                            j === i ? { ...x, [key]: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              {i > 0 && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setProfile((p: any) => ({
                      ...p,
                      addresses: p.addresses.filter((_: any, j: number) => i !== j),
                    }))
                  }
                >
                  Remove address
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setProfile((p: any) => ({
                ...p,
                addresses: [...p.addresses, { address: "", postcode: "", from: "", isCurrent: false }],
              }))
            }
          >
            Add previous address
          </button>
          <h2>Employment and income</h2>
          <p>Used for VIC items 5–6 / NSW employment and financial evidence.</p>
          <label>
            Employment status
            <select
              value={profile.employment.status}
              onChange={(e) => set("employment", "status", e.target.value)}
            >
              <option value="employed">Employed</option>
              <option value="not_employed">Not employed</option>
            </select>
          </label>
          <div className="grid">
            {fields("employment", [
              ["employer", "Current or most recent employer"],
              ["employerAddress", "Employer address"],
              ["endedOn", "Employment ended", "date"],
            ])}
            <label>
              Net weekly income (dollars)
              <input
                type="number"
                min="0"
                value={profile.employment.netWeeklyIncomeCents / 100}
                onChange={(e) =>
                  set("employment", "netWeeklyIncomeCents", Math.round(Number(e.target.value) * 100))
                }
              />
            </label>
          </div>
          <label>
            Other details about ability to pay
            <textarea
              value={profile.noRegularIncomeDetails}
              onChange={(e) => setProfile((p: any) => ({ ...p, noRegularIncomeDetails: e.target.value }))}
            />
          </label>
          <h2>Referees</h2>
          <p>Used for VIC item 9 / NSW references only if requested.</p>
          {profile.referees.map((ref: any, i: number) => (
            <fieldset key={i}>
              <legend>Referee {i + 1}</legend>
              <div className="grid">
                {["name", "phone", "email", "connection"].map((k) => (
                  <label key={k}>
                    {label(k)}
                    <input
                      value={ref[k]}
                      onChange={(e) =>
                        setProfile((p: any) => ({
                          ...p,
                          referees: p.referees.map((x: any, j: number) =>
                            i === j ? { ...x, [k]: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setProfile((p: any) => ({
                    ...p,
                    referees: p.referees.filter((_: any, j: number) => i !== j),
                  }))
                }
              >
                Remove referee
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setProfile((p: any) => ({
                ...p,
                referees: [...p.referees, { name: "", phone: "", email: "", connection: "" }],
              }))
            }
          >
            Add referee
          </button>
          <h2>Lease preferences</h2>
          <p>Used for VIC items 3 and 10 / NSW occupancy and lease.</p>
          <div className="grid">
            {fields("preferences", [
              ["desiredLeaseTerm", "Desired lease term"],
              ["preferredMoveInDate", "Preferred move in date", "date"],
            ])}
            <label>
              Total occupants
              <input
                type="number"
                min="1"
                max="20"
                value={profile.occupantsDefault}
                onChange={(e) => setProfile((p: any) => ({ ...p, occupantsDefault: Number(e.target.value) }))}
              />
            </label>
          </div>
          <button type="submit">Save profile</button>
        </form>
      </>
    );
  else if (path === "/documents")
    page = (
      <>
        <h1>Documents</h1>
        <p>
          Files are encrypted on this device. Remove bank transaction details for VIC and redact daily
          transactions for NSW. PDF, JPEG or PNG; maximum 10 MB each.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              file = f.get("file") as File;
            run(async () => {
              await vault!.addDocument(file, String(f.get("type")));
              const updatedDocs = await vault!.documents();
              vault!.assertUnlocked();
              setDocs(updatedDocs);
              (e.target as HTMLFormElement).reset();
              setMessage("Document encrypted and saved.");
            });
          }}
        >
          <label>
            Document type
            <select name="type">
              {[...new Set([...VIC_FINANCIAL, ...NSW_FINANCIAL, ...VIC_IDENTITY, ...NSW_IDENTITY])].map(
                (t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            File
            <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
          </label>
          <button type="submit">Add document</button>
        </form>
        <h2>Saved documents</h2>
        {docs.length === 0 ? (
          <p>No documents saved.</p>
        ) : (
          <ul>
            {docs.map((d) => (
              <li key={d.docId}>
                {d.filename} · {label(d.type)}{" "}
                <label>
                  Replace file
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        run(async () => {
                          await vault!.addDocument(file, d.type);
                          await vault!.deleteDocument(d.docId);
                          const updatedDocs = await vault!.documents();
                          vault!.assertUnlocked();
                          setDocs(updatedDocs);
                          setMessage("Document replaced.");
                        });
                    }}
                  />
                </label>{" "}
                <button
                  type="button"
                  className="text"
                  onClick={() =>
                    run(async () => {
                      await vault!.deleteDocument(d.docId);
                      const updatedDocs = await vault!.documents();
                      vault!.assertUnlocked();
                      setDocs(updatedDocs);
                    })
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  else if (path === "/settings")
    page = (
      <>
        <h1>Settings</h1>
        <h2>Encrypted backup</h2>
        <p>
          Backups contain your profile, documents and history. Choose a passphrase of at least 12 characters.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const pass = new FormData(e.currentTarget).get("pass") as string;
            run(async () => download(JSON.stringify(await vault!.backup(pass)), "rental-profile.aurak"));
          }}
        >
          <label>
            Backup passphrase
            <input name="pass" type="password" minLength={12} required />
          </label>
          <button type="submit">Export backup</button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              await vault!.restore(JSON.parse(await (f.get("backup") as File).text()), String(f.get("pass")));
              const restoredProfile = (await vault!.get("records", "profile")) || blank();
              const restoredDocs = await vault!.documents();
              vault!.assertUnlocked();
              setProfile(restoredProfile);
              setDocs(restoredDocs);
              setMessage("Backup imported.");
            });
          }}
        >
          <label>
            Backup file
            <input type="file" name="backup" accept=".aurak,application/json" required />
          </label>
          <label>
            Backup passphrase
            <input name="pass" type="password" required />
          </label>
          <button type="submit">Import backup</button>
        </form>
        <h2>Change passphrase</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const pass = String(new FormData(e.currentTarget).get("pass"));
            run(async () => {
              setVault(await vault!.changePassphrase(pass));
              setMessage("Passphrase changed.");
            });
          }}
        >
          <label>
            New passphrase
            <input name="pass" type="password" minLength={12} required />
          </label>
          <button type="submit">Change passphrase</button>
        </form>
        <h2>Automatic lock</h2>
        <label>
          Lock after inactivity (minutes)
          <input
            type="number"
            min="1"
            max="240"
            defaultValue={localStorage.getItem("aurak-lock-minutes") || 15}
            onChange={(e) => localStorage.setItem("aurak-lock-minutes", e.target.value)}
          />
        </label>
        <h2>Storage</h2>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            run(async () =>
              setMessage(
                (await navigator.storage.persist())
                  ? "Persistent storage granted."
                  : "Persistent storage was not granted.",
              ),
            )
          }
        >
          Request persistent storage
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            lock();
            nav("/");
          }}
        >
          Lock vault
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm("Delete all local vault data? This cannot be undone."))
              run(async () => {
                lock();
                await Vault.wipe();
                setExists(false);
                nav("/");
              });
          }}
        >
          Wipe vault
        </button>
      </>
    );
  else if (path === "/apply/done")
    page = (
      <>
        <h1>Application submitted</h1>
        {history.length ? (
          history.slice(-1).map((h: any) => (
            <article key={h.receipt?.submittedAt}>
              <p>Submitted: {h.receipt?.submittedAt}</p>
              <p>
                Form: {h.receipt?.formId} · Rules: {h.receipt?.rulesVersion}
              </p>
              <h2>Shared information</h2>
              <ul>
                {h.receipt?.sharedPaths?.map((x: string) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <h2>Documents</h2>
              <ul>
                {h.receipt?.documents?.map((d: any, i: number) => (
                  <li key={i}>
                    {label(d.type)} · {d.sha256}
                  </li>
                ))}
              </ul>
              <h2>Consents</h2>
              <ul>
                {h.receipt?.consents?.map((c: any) => (
                  <li key={c.id}>
                    {c.id}: {c.granted ? "granted" : "not granted"}
                  </li>
                ))}
              </ul>
              <p>
                <a href={h.portalUrl}>Open your applicant portal</a>
              </p>
              <p>Keep this link safe; it grants access to your application.</p>
            </article>
          ))
        ) : (
          <p>Receipt saved in your submission history.</p>
        )}
      </>
    );
  else if (path === "/history")
    page = (
      <>
        <h1>Submission history</h1>
        {history.length ? (
          history.map((h: any, i) => (
            <article key={i}>
              <p>
                {h.receipt?.submittedAt} · {h.receipt?.formId}
              </p>
              <a href={h.portalUrl}>Open applicant portal</a>{" "}
              <button
                type="button"
                className="text"
                onClick={() => download(exportApplicationJson(h.payload), "application.json")}
              >
                Download JSON
              </button>{" "}
              <button
                type="button"
                className="text"
                onClick={() =>
                  run(async () => {
                    const [regular, bold] = await Promise.all(
                      ["/fonts/NotoSans-Regular.ttf", "/fonts/NotoSans-Bold.ttf"].map(async (u) => {
                        const r = await fetch(u);
                        if (!r.ok) throw Error("PDF fonts are unavailable.");
                        return new Uint8Array(await r.arrayBuffer());
                      }),
                    );
                    download(
                      new Uint8Array(
                        await renderApplicationPdf(h.payload, {
                          fonts: { regular: regular!, bold: bold! },
                          now: new Date(h.payload.generatedAt),
                        }),
                      ),
                      "application.pdf",
                      "application/pdf",
                    );
                  })
                }
              >
                Download PDF
              </button>
            </article>
          ))
        ) : (
          <p>No saved submissions.</p>
        )}
      </>
    );
  else if (path === "/legal")
    page = (
      <>
        <h1>Legal information</h1>
        <p>{NSW_PROVISIONAL_BANNER}</p>
        <p>{DISCLAIMER}</p>
        <p>
          NSW privacy rules are applied early as best practice and may not yet be in force. Check the relevant
          regulator for current requirements.
        </p>
        <h2>Rules and sources</h2>
        {listRules().map((r) => (
          <section key={r.id} id={r.id}>
            <h3>{r.title}</h3>
            <p>
              {r.id} · {label(ruleStatus(r, today()))} · {label(r.confidence)}
            </p>
            <p>{r.summary}</p>
            <ul>
              {r.citations.map((c) => (
                <li key={c.url + c.pinpoint}>
                  <a href={c.url}>
                    {c.instrument} · {c.pinpoint}
                  </a>{" "}
                  (checked {c.checkedOn})
                </li>
              ))}
            </ul>
          </section>
        ))}
        <h2>Licences</h2>
        <p>
          Form text © State of Victoria (Consumer Affairs Victoria), CC BY 4.0. Noto Sans is licensed under
          the SIL Open Font License.
        </p>
      </>
    );
  else if (path.startsWith("/apply"))
    page = (
      <Apply
        vault={vault!}
        profile={profile}
        docs={docs}
        listing={listing}
        setListing={setListing}
        run={run}
        setMessage={setMessage}
      />
    );
  else if (path === "/my-application") page = <Portal run={run} setMessage={setMessage} />;
  else
    page = (
      <>
        <h1>Page not found</h1>
        <Link to="/">Home</Link>
      </>
    );
  return (
    <>
      <header>
        <Link className="brand" to="/">
          Rental application kit
        </Link>
        <nav aria-label="Main navigation">
          {vault && (
            <>
              <Link to="/profile">Profile</Link>
              <Link to="/documents">Documents</Link>
              <Link to="/apply">Apply</Link>
              <Link to="/history">History</Link>
              <Link to="/settings">Settings</Link>
            </>
          )}
          <Link to="/legal">Legal</Link>
        </nav>
      </header>
      <main>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        {page}
      </main>
      <footer>{DISCLAIMER}</footer>
    </>
  );
}

export function Apply({ vault, profile, docs, listing, setListing, run, setMessage }: any) {
  const navigate = useNavigate();
  const [url, setUrl] = useState(""),
    [origin, setOrigin] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [consents, setConsents] = useState<Record<string, boolean>>({}),
    [name, setName] = useState(""),
    [date, setDate] = useState<string>(today()),
    [inspection, setInspection] = useState(""),
    [inspectedOn, setInspectedOn] = useState<string>(today()),
    [manual, setManual] = useState(false),
    [historyIds, setHistoryIds] = useState<string[]>(["0"]),
    [refereeIds, setRefereeIds] = useState<string[]>([]),
    [turnstileToken, setTurnstileToken] = useState(""),
    [groupCode, setGroupCode] = useState("");
  useEffect(() => {
    const slug = location.pathname.match(/^\/apply\/([a-z2-7]{12})$/)?.[1];
    if (!slug || listing) return;
    let active = true;
    fetch(`/api/public/listings/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw Error("Could not load listing.");
        return r.json();
      })
      .then((value) => {
        if (active) {
          vault.assertUnlocked();
          setOrigin(location.origin);
          setListing(value);
        }
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [listing, setListing, setMessage, vault]);
  const available = docs.filter(
    (d: any) =>
      listing &&
      (listing.financialRequested.includes(d.type) ||
        (listing.jurisdiction === "VIC" &&
          listing.identityStage === "application" &&
          listing.identityRequested.includes(d.type))),
  );
  let result: any = null;
  if (listing) {
    try {
      result = buildPayload({
        profile,
        listing,
        documents: docs.map(({ addedAt, ...d }: any) => d),
        selections: {
          financialDocIds: selected.filter((id) =>
            docs.some((d: any) => d.docId === id && listing.financialRequested.includes(d.type)),
          ),
          identityDocIds: selected.filter((id) =>
            docs.some((d: any) => d.docId === id && listing.identityRequested.includes(d.type)),
          ),
          historyIds: historyIds as [string, string?],
          refereeIds,
          inspection:
            inspection === "inspected"
              ? { status: "inspected", inspectedOn }
              : inspection
                ? { status: inspection, writtenStatement: true }
                : undefined,
          consents,
          signature: { printName: name, date },
        },
        on: today(),
      } as any);
    } catch {
      /* Incomplete profile is presented below. */
    }
  }
  const show = CONSENTS.filter(
    (c) =>
      listing &&
      c.jurisdictions.some((j) => j === listing.jurisdiction) &&
      (c.whenShown === "always" ||
        c.whenShown === "optional" ||
        (c.whenShown === "referees_requested" &&
          (listing.refereesRequested || profile.addresses.some((a: any) => a.providerName))) ||
        (c.whenShown === "databases_listed" && listing.tenancyDatabases.length) ||
        (c.whenShown === "not_inspected" && inspection && inspection !== "inspected")),
  );
  return (
    <>
      <h1>Prepare an application</h1>
      {!listing && manual ? (
        <ManualListing
          onSave={(value: any) => {
            setListing(value);
            setOrigin("");
            setManual(false);
          }}
        />
      ) : !listing ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const u = new URL(url);
                if (!["https:", "http:"].includes(u.protocol) || !/^\/apply\/[a-z2-7]{12}$/.test(u.pathname))
                  throw Error("Enter a valid agency apply link.");
                if (u.protocol === "http:" && !["127.0.0.1", "localhost"].includes(u.hostname))
                  throw Error("Use an HTTPS agency link.");
                const r = await fetch(`${u.origin}/api/public/listings/${u.pathname.split("/").pop()}`);
                if (!r.ok) throw Error("Could not load listing.");
                const result = await r.json();
                vault.assertUnlocked();
                setOrigin(u.origin);
                setListing(result);
              });
            }}
          >
            <p>Paste an apply link from the agency.</p>
            <label>
              Apply link
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
            </label>
            <button type="submit">Load listing</button>
          </form>
          <button type="button" className="secondary" onClick={() => setManual(true)}>
            Prepare a form for an agent who does not use this kit
          </button>
        </>
      ) : (
        <>
          <button type="button" className="secondary" onClick={() => setListing(null)}>
            Choose another listing
          </button>
          {listing.jurisdiction === "NSW" && <p className="notice">{NSW_PROVISIONAL_BANNER}</p>}
          <h2>{listing.item1.premisesAddress}</h2>
          <p>
            {listing.item2.name} · {listing.status}
          </p>
          <h2>Requested documents</h2>
          <p>
            Financial: {listing.financialRequested.map(label).join(", ") || "None"}. Identity:{" "}
            {listing.identityStage === "preferred"
              ? "Requested later from the preferred applicant"
              : listing.identityRequested.map(label).join(", ") || "None"}
            .
          </p>
          {available.map((d: any) => (
            <label key={d.docId}>
              <input
                className="check"
                type="checkbox"
                checked={selected.includes(d.docId)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, d.docId] : selected.filter((x) => x !== d.docId),
                  )
                }
              />
              {d.filename} · {label(d.type)}
            </label>
          ))}
          <p>
            <Link to="/documents">Manage documents</Link>
          </p>
          {listing.jurisdiction === "NSW" && (
            <>
              <h2>Inspection</h2>
              <label>
                Inspection status
                <select value={inspection} onChange={(e) => setInspection(e.target.value)}>
                  <option value="">Choose one</option>
                  <option value="inspected">Inspected</option>
                  <option value="unable">Unable to inspect</option>
                  <option value="does_not_wish">Do not wish to inspect</option>
                </select>
              </label>
              {inspection === "inspected" && (
                <label>
                  Inspection date
                  <input type="date" value={inspectedOn} onChange={(e) => setInspectedOn(e.target.value)} />
                </label>
              )}
            </>
          )}
          <h2>Address history</h2>
          <p>Choose up to two addresses.</p>
          {profile.addresses.map((a: any, i: number) => (
            <label key={i}>
              <input
                className="check"
                type="checkbox"
                checked={historyIds.includes(String(i))}
                onChange={(e) =>
                  setHistoryIds(
                    e.target.checked
                      ? [...historyIds, String(i)].slice(0, 2)
                      : historyIds.filter((x) => x !== String(i)),
                  )
                }
              />
              {a.address || `Address ${i + 1}`}
            </label>
          ))}
          {listing.refereesRequested && (
            <>
              <h2>Referees</h2>
              <p>Choose up to two referees.</p>
              {profile.referees.map((r: any, i: number) => (
                <label key={i}>
                  <input
                    className="check"
                    type="checkbox"
                    checked={refereeIds.includes(String(i))}
                    onChange={(e) =>
                      setRefereeIds(
                        e.target.checked
                          ? [...refereeIds, String(i)].slice(0, 2)
                          : refereeIds.filter((x) => x !== String(i)),
                      )
                    }
                  />
                  {r.name || `Referee ${i + 1}`}
                </label>
              ))}
            </>
          )}
          <h2>Collection notice</h2>
          <p className="preserve">{listing.collectionNoticeMd}</p>
          {listing.privacyPolicyUrl && <a href={listing.privacyPolicyUrl}>Privacy policy</a>}
          <h2>Consents</h2>
          {show.map((c) => (
            <label key={c.id}>
              <input
                className="check"
                type="checkbox"
                checked={!!consents[c.id]}
                onChange={(e) => setConsents({ ...consents, [c.id]: e.target.checked })}
              />
              {consentText(c.id, listing.item2.name, listing.item1.premisesAddress)}
            </label>
          ))}
          <h2>Applying with others</h2>
          <p>
            Each adult submits their own form. Share an optional group code with co-applicants so the agency
            can identify your applications together.
          </p>
          <label>
            Group code (optional)
            <input
              value={groupCode}
              maxLength={8}
              pattern="[A-Z2-7]{8}"
              onChange={(e) => setGroupCode(e.target.value.toUpperCase())}
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
              setGroupCode(
                Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => alphabet[n % 32]).join(""),
              );
            }}
          >
            Generate group code
          </button>
          {groupCode && !/^[A-Z2-7]{8}$/.test(groupCode) && (
            <p role="alert">Use eight letters A–Z or digits 2–7.</p>
          )}
          <h2>Signature</h2>
          <p>
            I understand that my application may not be processed unless all required documents are submitted.
          </p>
          <label>
            Type your full name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <h2>Review</h2>
          <div className="grid">
            <section>
              <h3>Will be shared</h3>
              {result?.shared.map((x: any) => (
                <p key={x.path}>{x.label}</p>
              ))}
              {selected.map((id) => (
                <p key={id}>{docs.find((d: any) => d.docId === id)?.filename}</p>
              ))}
            </section>
            <section>
              <h3>Not shared</h3>
              {result?.excluded.map((x: any) => (
                <p key={x.path}>
                  {x.reason}{" "}
                  <small>
                    (<a href={`/legal#${x.ruleId}`}>{x.ruleId}</a>)
                  </small>
                </p>
              ))}
            </section>
          </div>
          {(!result || result.errors.length > 0) && (
            <div role="alert">
              <h3>Complete before exporting or submitting</h3>
              {result ? (
                result.errors.map((x: any, i: number) => (
                  <p key={i}>
                    {x.reason} ({x.ruleId})
                  </p>
                ))
              ) : (
                <p>Complete your profile and review your details.</p>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={!result?.payload}
            onClick={() => download(exportApplicationJson(result.payload), "application.json")}
          >
            Download JSON
          </button>
          <button
            type="button"
            disabled={!result?.payload}
            onClick={() =>
              run(async () => {
                const [regular, bold] = await Promise.all(
                  ["/fonts/NotoSans-Regular.ttf", "/fonts/NotoSans-Bold.ttf"].map(async (u) => {
                    const r = await fetch(u);
                    if (!r.ok) throw Error("PDF fonts are unavailable.");
                    return new Uint8Array(await r.arrayBuffer());
                  }),
                );
                const bytes = await renderApplicationPdf(result.payload, {
                  fonts: { regular: regular!, bold: bold! },
                  now: new Date(result.payload.generatedAt),
                });
                download(new Uint8Array(bytes), "application.pdf", "application/pdf");
              })
            }
          >
            Download PDF
          </button>
          <button
            type="button"
            disabled={
              !result?.payload ||
              listing.status !== "open" ||
              (!!listing.turnstileSiteKey && !turnstileToken) ||
              (!!groupCode && !/^[A-Z2-7]{8}$/.test(groupCode)) ||
              !origin
            }
            onClick={() =>
              run(async () => {
                const payload = result.payload,
                  refs = documentRefs(payload),
                  body = new FormData();
                const hash = Array.from(
                  new Uint8Array(
                    await crypto.subtle.digest(
                      "SHA-256",
                      new TextEncoder().encode(listing.collectionNoticeMd),
                    ),
                  ),
                  (x) => x.toString(16).padStart(2, "0"),
                ).join("");
                const manifest = [];
                let n = 0;
                for (const category of ["financial", "identity"] as const)
                  for (const d of refs[category]) {
                    const part = `doc_${n++}`;
                    body.append(
                      part,
                      new Blob([await vault.document(d.docId)], { type: d.contentType }),
                      d.filename,
                    );
                    manifest.push({ part, category, type: d.type, filename: d.filename });
                  }
                body.append(
                  "application",
                  JSON.stringify({
                    payload,
                    consents: payload.consents.map(({ id, sha256, granted }: any) => ({
                      id,
                      sha256,
                      granted,
                    })),
                    collectionNoticeSha256: hash,
                    ...(groupCode ? { groupCode } : {}),
                    ...(turnstileToken ? { turnstileToken } : {}),
                  }),
                );
                const response = await fetch(`${origin}/api/public/listings/${listing.slug}/applications`, {
                  method: "POST",
                  body,
                });
                const data = await response.json();
                if (!response.ok) throw Error(data.error || "Submission failed.");
                const portalUrl = origin + data.portalPath;
                await vault.put("submissions", data.applicationId, {
                  listing,
                  payload,
                  receipt: data.receipt,
                  portalUrl,
                  applicantToken: data.applicantToken,
                });
                setMessage("Application submitted. Open history for the receipt and portal link.");
                navigate("/apply/done");
              })
            }
          >
            Submit application
          </button>
          {listing.turnstileSiteKey && (
            <Turnstile siteKey={listing.turnstileSiteKey} onToken={setTurnstileToken} />
          )}
        </>
      )}
    </>
  );
}
function Turnstile({ siteKey, onToken }: any) {
  const [error, setError] = useState("");
  useEffect(() => {
    let widget: string | undefined;
    const id = "aurak-turnstile-script";
    const render = () => {
      const service = (window as any).turnstile;
      if (service && document.getElementById("aurak-turnstile"))
        widget = service.render("#aurak-turnstile", {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => {
            onToken("");
            setError("Verification failed. Please reload or contact the agency.");
          },
        });
    };
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = id;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
    script.addEventListener("load", render);
    script.addEventListener("error", () =>
      setError("Verification could not load. Contact the agency for another way to apply."),
    );
    if ((window as any).turnstile) render();
    return () => {
      script?.removeEventListener("load", render);
      if (widget) (window as any).turnstile?.remove(widget);
    };
  }, [siteKey, onToken]);
  return (
    <>
      <div id="aurak-turnstile" role="group" aria-label="Verification" />
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function ManualListing({ onSave }: any) {
  const [j, setJ] = useState("VIC"),
    [fin, setFin] = useState<string[]>([]),
    [ids, setIds] = useState<string[]>([]),
    [databases, setDatabases] = useState<any[]>([]),
    [maxFinancialDocs, setMaxFinancialDocs] = useState(1);
  const toggle = (t: string, values: string[], set: (x: string[]) => void) =>
    set(values.includes(t) ? values.filter((x) => x !== t) : [...values, t]);
  return (
    <>
      <h2>Manual listing</h2>
      <p>
        Enter the details and document requests supplied by the agent. You can export the form to share
        directly.
      </p>
      {j === "NSW" && <p className="notice">{NSW_PROVISIONAL_BANNER}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (fin.length > 2 || ids.length > 2) {
            alert("Select at most two documents in each category.");
            return;
          }
          onSave({
            schemaVersion: "aurak.listing-public.v1",
            slug: "aaaaaaaaaaaa",
            jurisdiction: j,
            formId: j === "VIC" ? "VIC-3A-2026-03-31" : "NSW-PROVISIONAL-2026-11-04",
            provisional: j === "NSW",
            status: "open",
            item1: { premisesAddress: f.get("premises") },
            item2: {
              name: f.get("name"),
              address: f.get("address"),
              phone: f.get("phone"),
              email: f.get("email"),
              providerStateOrTerritory: f.get("state"),
              ...(f.get("abn") ? { acnOrAbn: f.get("abn") } : {}),
            },
            financialRequested: fin,
            identityRequested: ids,
            identityStage: j === "NSW" ? "preferred" : String(f.get("stage")),
            maxFinancialDocs: j === "NSW" ? maxFinancialDocs : 2,
            refereesRequested: f.get("refs") === "on",
            tenancyDatabases: databases,
            collectionNoticeMd: f.get("notice"),
            privacyPolicyUrl: null,
            retentionSummary: {
              unsuccessfulDays: Number(f.get("unsuccessfulDays")),
              successfulHandoffDays: Number(f.get("handoffDays")),
            },
            turnstileSiteKey: null,
            rulesVersion: rulesVersion(),
          });
        }}
      >
        <label>
          Jurisdiction
          <select
            value={j}
            onChange={(e) => {
              setJ(e.target.value);
              setFin([]);
              setIds([]);
            }}
          >
            <option>VIC</option>
            <option>NSW</option>
          </select>
        </label>
        {[
          ["premises", "Address of premises"],
          ["name", "Full name or company name of rental provider or their agent"],
          ["address", "Agent address"],
          ["phone", "Agent phone"],
          ["email", "Agent email"],
        ].map(([n, l]) => (
          <label key={n}>
            {l}
            <input name={n} required />
          </label>
        ))}
        <label>
          ACN or ABN, if applicable
          <input name="abn" />
        </label>
        <label>
          Provider state or territory
          <select name="state">
            {["VIC", "NSW", "QLD", "SA", "WA", "TAS", "NT", "ACT", "overseas"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Agency collection notice
          <textarea name="notice" minLength={20} required />
        </label>
        <label>
          Unsuccessful application retention (days)
          <input name="unsuccessfulDays" type="number" min="0" max="28" required />
        </label>
        <label>
          Successful handoff retention (days)
          <input name="handoffDays" type="number" min="0" max="90" required />
        </label>
        <h3>Financial documents requested</h3>
        {(j === "VIC" ? VIC_FINANCIAL : NSW_FINANCIAL).map((t) => (
          <label key={t}>
            <input
              className="check"
              type="checkbox"
              checked={fin.includes(t)}
              onChange={() => toggle(t, fin, setFin)}
            />
            {label(t)}
          </label>
        ))}
        {j === "NSW" && (
          <label>
            Maximum financial documents
            <select value={maxFinancialDocs} onChange={(e) => setMaxFinancialDocs(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
        )}
        <h3>Identity documents requested</h3>
        {(j === "VIC" ? VIC_IDENTITY : NSW_IDENTITY).map((t) => (
          <label key={t}>
            <input
              className="check"
              type="checkbox"
              checked={ids.includes(t)}
              onChange={() => toggle(t, ids, setIds)}
            />
            {label(t)}
          </label>
        ))}
        {j === "VIC" && (
          <label>
            Identity stage
            <select name="stage">
              <option value="preferred">Preferred applicant</option>
              <option value="application">Application</option>
            </select>
          </label>
        )}
        <label>
          <input className="check" type="checkbox" name="refs" />
          Referees requested
        </label>
        <h3>Tenancy databases used</h3>
        {databases.map((d: any, i: number) => (
          <fieldset key={i}>
            <legend>Database {i + 1}</legend>
            {(
              [
                ["name", "Name"],
                ["phone", "Phone"],
                ["webAddress", "Website"],
              ] as const
            ).map(([k, l]) => (
              <label key={k}>
                {l}
                <input
                  required
                  value={d[k]}
                  onChange={(e) =>
                    setDatabases(
                      databases.map((x: any, n: number) => (n === i ? { ...x, [k]: e.target.value } : x)),
                    )
                  }
                />
              </label>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => setDatabases(databases.filter((_: any, n: number) => n !== i))}
            >
              Remove database
            </button>
          </fieldset>
        ))}
        {databases.length < 3 && (
          <button
            type="button"
            className="secondary"
            onClick={() => setDatabases([...databases, { name: "", phone: "", webAddress: "" }])}
          >
            Add database
          </button>
        )}
        <button type="submit">Review application</button>
      </form>
    </>
  );
}
function Portal({ run, setMessage }: any) {
  const params = new URLSearchParams(location.hash.slice(1)),
    id = params.get("id"),
    token = params.get("t");
  const [data, setData] = useState<any>(null),
    [text, setText] = useState(""),
    [idType, setIdType] = useState("");
  const base = `/api/applicant/applications/${encodeURIComponent(id || "")}`;
  const call = async (path = "", method = "GET", body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Request failed.");
    return d;
  };
  useEffect(() => {
    if (!id || !token) return;
    let active = true;
    fetch(`/api/applicant/applications/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Request failed.");
        return result;
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [id, token, setMessage]);
  return (
    <>
      <h1>My application</h1>
      {!id || !token ? (
        <p>Open the portal link supplied after submission.</p>
      ) : !data ? (
        <p>Loading application…</p>
      ) : (
        <>
          {data.provisional && <p className="notice">{NSW_PROVISIONAL_BANNER}</p>}
          <p>Status: {data.status}</p>
          <p>Property: {data.listing?.premises}</p>
          {data.notices?.map((n: any, i: number) => (
            <article key={i}>
              <h2>{label(n.type)}</h2>
              <p>{n.body}</p>
            </article>
          ))}
          {data.identityRequest?.allowed && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const file = new FormData(e.currentTarget).get("file") as File;
                run(async () => {
                  const bytes = new Uint8Array(await file.arrayBuffer());
                  if (bytes.length > 10 * 1024 * 1024 || !bytes.length)
                    throw Error("File must be between 1 byte and 10 MB.");
                  const valid =
                    new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" ||
                    (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
                    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => v === bytes[i]);
                  if (!valid) throw Error("Choose a valid PDF, JPEG or PNG.");
                  const body = new FormData();
                  body.append("doc_0", file);
                  body.append(
                    "application",
                    JSON.stringify({
                      documents: [{ part: "doc_0", category: "identity", type: idType, filename: file.name }],
                    }),
                  );
                  const r = await fetch(`${base}/identity-documents`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body,
                  });
                  const d = await r.json();
                  if (!r.ok) throw Error(d.error || "Upload failed.");
                  setMessage("Identity document uploaded.");
                  setData(await call());
                });
              }}
            >
              <h2>Identity documents</h2>
              <p>Choose a requested type. Files are limited to PDF, JPEG or PNG and 10 MB.</p>
              <label>
                Document type
                <select required value={idType} onChange={(e) => setIdType(e.target.value)}>
                  <option value="">Choose type</option>
                  {data.identityRequest.types.map((t: string) => (
                    <option key={t} value={t}>
                      {label(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                File
                <input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required />
              </label>
              <button type="submit">Upload identity document</button>
            </form>
          )}
          <button
            type="button"
            onClick={() =>
              run(async () => download(JSON.stringify(await call("/export"), null, 2), "my-application.json"))
            }
          >
            Export my data
          </button>
          <label>
            Correction request
            <textarea maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={() =>
              run(async () => {
                await call("/messages", "POST", { kind: "correction_request", text });
                setText("");
                setMessage("Correction request sent.");
              })
            }
          >
            Send correction request
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              run(async () => {
                await call("/consents", "POST", { id: "vic_retain_for_other_premises@1", granted: false });
                setMessage("Consent withdrawn.");
              })
            }
          >
            Withdraw consent for other premises
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (confirm("Withdraw this application?"))
                run(async () => {
                  await call("/withdraw", "POST");
                  setData(await call());
                  setMessage("Application withdrawn.");
                });
            }}
          >
            Withdraw application
          </button>
        </>
      )}
    </>
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
