// biome-ignore-all lint/suspicious/noArrayIndexKey: Form rows are controlled by their parent and have no persisted row IDs.
import { DISCLAIMER, NSW_PROVISIONAL_BANNER } from "@aurak/forms";
import { renderApplicationPdf } from "@aurak/pdf";
import { addDays, addYears, NSW_FINANCIAL, NSW_IDENTITY, VIC_FINANCIAL, VIC_IDENTITY } from "@aurak/rules";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, useLocation } from "react-router";
import legalQuestions from "../../../docs/LEGAL-QUESTIONS.md?raw";
import "./style.css";

const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
let devAuthEnabled = false;
function agentHeaders(): Record<string, string> {
  const user = devAuthEnabled && loopback ? sessionStorage.getItem("aurak-dev-user") : null;
  return user ? { "X-Dev-User": user } : {};
}
async function downloadAgent(path: string, filename: string) {
  const response = await fetch(`/api/agent${path}`, { headers: agentHeaders() });
  if (!response.ok) throw Error(`Download failed (${response.status}).`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const label = (v: string) => v.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`/api/agent${path}`, {
    method,
    headers: { ...agentHeaders(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Request failed");
  return d;
}
export function App() {
  const { pathname } = useLocation();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [counts, setCounts] = useState<any>(null),
    [devMode, setDevMode] = useState<"checking" | "on" | "off">(
      loopback && import.meta.env.MODE !== "test" ? "checking" : "off",
    ),
    [devUser, setDevUser] = useState(() => sessionStorage.getItem("aurak-dev-user") || ""),
    [devInput, setDevInput] = useState("");
  useEffect(() => {
    if (devMode !== "checking") return;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        devAuthEnabled = loopback && d.devAuth === true;
        setDevMode(devAuthEnabled ? "on" : "off");
      })
      .catch(() => setDevMode("off"));
  }, [devMode]);
  const ready = devMode === "off" || (devMode === "on" && !!devUser);
  let endpoint = pathname.replace(/^\/agent/, "");
  if (!endpoint || endpoint === "/") endpoint = "/listings";
  if (endpoint === "/legal") endpoint = "/rules";
  if (endpoint === "/listings/new") endpoint = "/me";
  if (/\/listings\/[^/]+\/(edit|close)$/.test(endpoint)) endpoint = endpoint.replace(/\/(edit|close)$/, "");
  useEffect(() => {
    if (!ready) return;
    setData(null);
    setError("");
    api(endpoint)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [endpoint, ready]);
  useEffect(() => {
    if (ready && pathname === "/agent/")
      api("/retention")
        .then((d) => setCounts(d.counts))
        .catch(() => {});
  }, [pathname, ready]);
  const refresh = () =>
    api(endpoint)
      .then(setData)
      .catch((e) => setError(e.message));
  const action = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };
  let content: React.ReactNode;
  if (devMode === "checking") content = <p>Checking local configuration…</p>;
  else if (devMode === "on" && !devUser)
    content = (
      <>
        <h1>Local development sign-in</h1>
        <p>
          Use a fixture staff address ending in @example.com. This local-only identity is for development.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = devInput.trim().toLowerCase();
            if (!/^[a-z0-9._%+-]+@example\.com$/.test(value)) {
              setError("Use a fixture address ending in @example.com.");
              return;
            }
            sessionStorage.setItem("aurak-dev-user", value);
            setDevUser(value);
            setError("");
          }}
        >
          <label>
            Fixture staff email
            <input type="email" value={devInput} onChange={(e) => setDevInput(e.target.value)} required />
          </label>
          <button type="submit">Continue</button>
        </form>
        {error && <p role="alert">{error}</p>}
      </>
    );
  else if (error && !data) content = <p role="alert">{error}</p>;
  else if (!data) content = <p>Loading…</p>;
  else if (pathname === "/agent/" || pathname === "/agent/listings") {
    const listings = Array.isArray(data) ? data : data.items || [];
    content = (
      <>
        <h1>Listings</h1>
        {pathname === "/agent/" && (
          <>
            <p className="notice">{NSW_PROVISIONAL_BANNER}</p>
            {counts && (
              <dl>
                {Object.entries(counts).map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>
                      {["purgesDue", "latePurges", "overdueDatabaseNotices"].includes(k) ? (
                        <Link
                          to={
                            k === "overdueDatabaseNotices"
                              ? "/agent/retention#overdue-notices"
                              : "/agent/retention"
                          }
                        >
                          {label(k)}
                        </Link>
                      ) : (
                        label(k)
                      )}
                    </dt>
                    <dd>{String(v)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
          </>
        )}
        <p>Manage applications and property listings.</p>
        <Link className="button" to="/agent/listings/new">
          New listing
        </Link>
        {listings.length ? (
          <ul>
            {listings.map((l: any) => (
              <li key={l.id}>
                <Link to={`/agent/listings/${l.id}`}>{l.premisesAddress || l.item1?.premisesAddress}</Link> ·{" "}
                {l.jurisdiction} · {label(l.status)}
              </li>
            ))}
          </ul>
        ) : (
          <p>No listings.</p>
        )}
        {data.cursor && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              api(`/listings?cursor=${encodeURIComponent(data.cursor)}`)
                .then((d) => setData({ ...d, items: [...listings, ...d.items] }))
                .catch((e) => setError(e.message))
            }
          >
            Load more listings
          </button>
        )}
      </>
    );
  } else if (pathname === "/agent/listings/new" || pathname.endsWith("/edit"))
    content = (
      <ListingEditor initial={pathname.endsWith("/edit") ? data : null} settings={data} action={action} />
    );
  else if (/^\/agent\/listings\/[^/]+\/close$/.test(pathname))
    content = <CloseListing data={data} action={action} />;
  else if (/^\/agent\/listings\/[^/]+$/.test(pathname)) content = <Listing data={data} action={action} />;
  else if (/^\/agent\/applications\/[^/]+$/.test(pathname))
    content = <Application data={data} id={pathname.split("/").pop()!} action={action} />;
  else if (pathname === "/agent/settings") content = <Settings data={data} action={action} />;
  else if (pathname === "/agent/legal")
    content = (
      <>
        <h1>Rules and legal information</h1>
        <p className="notice">{NSW_PROVISIONAL_BANNER}</p>
        <p>NSW pending rules are applied early as best practice and may not yet be in force.</p>
        <Records data={data} />
        <h2>Open legal questions</h2>
        <div className="preserve">{legalQuestions}</div>
      </>
    );
  else if (pathname === "/agent/retention") content = <Retention data={data} action={action} />;
  else if (pathname === "/agent/audit") content = <Audit data={data} action={action} />;
  else
    content = (
      <>
        <h1>Page not found</h1>
        <Link to="/agent/">Dashboard</Link>
      </>
    );
  return (
    <>
      <header>
        <Link className="brand" to="/agent/">
          Rental application kit · Agency
        </Link>
        <nav aria-label="Agency navigation">
          <Link to="/agent/listings">Listings</Link>
          <Link to="/agent/retention">Retention</Link>
          <Link to="/agent/audit">Audit</Link>
          <Link to="/agent/settings">Settings</Link>
          <Link to="/agent/legal">Legal</Link>
        </nav>
      </header>
      <main>
        {error && data && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {content}
      </main>
      <footer>{DISCLAIMER}</footer>
    </>
  );
}
function Records({ data }: any) {
  const rows = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) as any[] | undefined);
  if (!rows?.length) return <p>No records.</p>;
  return (
    <ul>
      {rows.map((r: any, i: number) => (
        <li key={r.id || i}>
          {Object.entries(r)
            .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
            .map(([k, v]) => (
              <span key={k}>
                <strong>{label(k)}:</strong> {String(v)} ·{" "}
              </span>
            ))}
        </li>
      ))}
    </ul>
  );
}
function Retention({ data, action }: any) {
  const [current, setCurrent] = useState(data),
    [error, setError] = useState("");
  useEffect(() => setCurrent(data), [data]);
  return (
    <>
      <h1>Retention</h1>
      <p>Upcoming and overdue purges.</p>
      <h2 id="overdue-notices">Overdue database notices</h2>
      {current.overdueApplications?.length ? (
        <ul>
          {current.overdueApplications.map((a: any) => (
            <li key={a.id}>
              <Link to={`/agent/applications/${a.id}`}>Application {a.id}</Link> · Checked {a.checkedAt}
            </li>
          ))}
        </ul>
      ) : (
        <p>No overdue notices on this page.</p>
      )}
      <h2>Applications</h2>
      {(current.applications || []).map((a: any) => (
        <article key={a.id}>
          <p>
            <Link to={`/agent/applications/${a.id}`}>{a.id}</Link> · Due{" "}
            {a.purgeDueAt || a.purge_due_at || "not set"}
          </p>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (confirm("Permanently purge this application?"))
                action(() => api(`/applications/${a.id}/purge`, "POST", {}));
            }}
          >
            Purge now
          </button>
        </article>
      ))}
      <h2>Documents</h2>
      <Records data={current.documents || []} />
      <h2>Purge receipts</h2>
      <Records data={current.receipts || []} />
      {error && <p role="alert">{error}</p>}
      {current.cursor && (
        <button
          type="button"
          className="secondary"
          onClick={() =>
            api(`/retention?cursor=${encodeURIComponent(current.cursor)}`)
              .then((d) =>
                setCurrent({
                  ...d,
                  applications: [...current.applications, ...d.applications],
                  receipts: [...current.receipts, ...d.receipts],
                  documents: [...current.documents, ...d.documents],
                  overdueApplications: [
                    ...(current.overdueApplications || []),
                    ...(d.overdueApplications || []),
                  ],
                }),
              )
              .catch((e) => setError(e.message))
          }
        >
          Load more retention records
        </button>
      )}
    </>
  );
}
function Audit({ data }: any) {
  const [rows, setRows] = useState(data.items || []),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState<string | null>(data.cursor),
    [filters, setFilters] = useState({ from: "", to: "", action: "", targetId: "" });
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  return (
    <>
      <h1>Audit log</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          api(`/audit?${query}`)
            .then((d) => {
              setRows(d.items || []);
              setCursor(d.cursor);
            })
            .catch((e) => setError(e.message));
        }}
      >
        <div className="grid">
          {(
            [
              ["from", "From", "datetime-local"],
              ["to", "To", "datetime-local"],
              ["action", "Action", "text"],
              ["targetId", "Target ID", "text"],
            ] as const
          ).map(([k, l, t]) => (
            <label key={k}>
              {l}
              <input
                type={t}
                value={filters[k]}
                onChange={(e) => setFilters({ ...filters, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <button type="submit">Apply filters</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="secondary"
        onClick={() =>
          downloadAgent(`/audit?${query}${query.size ? "&" : ""}format=csv`, "audit.csv").catch((e) =>
            setError(e.message),
          )
        }
      >
        Export CSV
      </button>
      <Records data={rows} />
      {cursor && (
        <button
          type="button"
          className="secondary"
          onClick={() =>
            api(`/audit?${query}${query.size ? "&" : ""}cursor=${encodeURIComponent(cursor)}`)
              .then((d) => {
                setRows([...rows, ...d.items]);
                setCursor(d.cursor);
              })
              .catch((e) => setError(e.message))
          }
        >
          Load more audit entries
        </button>
      )}
    </>
  );
}

function ListingEditor({ initial, settings, action }: any) {
  const [jurisdiction, setJ] = useState(initial?.jurisdiction || "VIC"),
    [address, setAddress] = useState(initial?.premisesAddress || initial?.item1?.premisesAddress || ""),
    [financial, setFin] = useState<string[]>(initial?.financialRequested || []),
    [identity, setId] = useState<string[]>(initial?.identityRequested || []),
    [stage, setStage] = useState(initial?.identityStage || "preferred"),
    [refs, setRefs] = useState(initial?.refereesRequested || false),
    [maxFin, setMaxFin] = useState(initial?.maxFinancialDocs || 1),
    [databases, setDatabases] = useState<any[]>(initial?.tenancyDatabases || []);
  const update = (value: string, current: string[], set: (v: string[]) => void) =>
    set(current.includes(value) ? current.filter((x) => x !== value) : [...current, value]);
  return (
    <>
      <h1>{initial ? "Edit listing" : "New listing"}</h1>
      {jurisdiction === "NSW" && <p className="notice">{NSW_PROVISIONAL_BANNER}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action(async () => {
            if (financial.length > 2 || identity.length > 2)
              throw Error(
                "Select at most two documents in each category (VIC.DOCS.FINANCIAL_MAX_TWO / VIC.DOCS.IDENTITY_MAX_TWO).",
              );
            const body = {
              jurisdiction,
              premisesAddress: address,
              financialRequested: financial,
              identityRequested: identity,
              identityStage: jurisdiction === "NSW" ? "preferred" : stage,
              maxFinancialDocs: jurisdiction === "NSW" ? maxFin : 2,
              refereesRequested: refs,
              tenancyDatabases: databases,
            };
            const result = await api(
              initial ? `/listings/${initial.id}` : "/listings",
              initial ? "PATCH" : "POST",
              body,
            );
            location.href = `/agent/listings/${result.id || initial?.id}`;
          });
        }}
      >
        <label>
          Jurisdiction
          <select
            value={jurisdiction}
            onChange={(e) => {
              setJ(e.target.value);
              setFin([]);
              setId([]);
            }}
          >
            <option>VIC</option>
            <option>NSW</option>
          </select>
        </label>
        <label>
          Address of premises
          <input required minLength={5} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <p>Agency details are taken from settings.</p>
        <h2>Financial documents</h2>
        {(jurisdiction === "VIC" ? VIC_FINANCIAL : NSW_FINANCIAL).map((t) => (
          <label key={t}>
            <input
              className="check"
              type="checkbox"
              checked={financial.includes(t)}
              onChange={() => update(t, financial, setFin)}
            />
            {label(t)}
          </label>
        ))}
        {jurisdiction === "NSW" && (
          <label>
            Maximum financial documents
            <select value={maxFin} onChange={(e) => setMaxFin(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
        )}
        <h2>Identity documents</h2>
        {(jurisdiction === "VIC" ? VIC_IDENTITY : NSW_IDENTITY).map((t) => (
          <label key={t}>
            <input
              className="check"
              type="checkbox"
              checked={identity.includes(t)}
              onChange={() => update(t, identity, setId)}
            />
            {label(t)}
          </label>
        ))}
        <label>
          Identity stage
          <select
            value={jurisdiction === "NSW" ? "preferred" : stage}
            disabled={jurisdiction === "NSW"}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="preferred">Preferred applicant</option>
            <option value="application">Application</option>
          </select>
        </label>
        <label>
          <input
            className="check"
            type="checkbox"
            checked={refs}
            onChange={(e) => setRefs(e.target.checked)}
          />
          Request referees
        </label>
        <h2>Tenancy databases</h2>
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
        <button type="submit">Save listing</button>
      </form>
    </>
  );
}
export function Listing({ data, action }: any) {
  const l = data.listing || data;
  const [apps, setApps] = useState<any[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [listError, setListError] = useState("");
  const load = (next?: string) =>
    api(`/listings/${l.id}/applications${next ? `?cursor=${encodeURIComponent(next)}` : ""}`)
      .then((d) => {
        setApps((previous) => (next ? [...previous, ...d.items] : d.items || []));
        setCursor(d.cursor);
      })
      .catch((e) => setListError(e.message));
  useEffect(() => {
    api(`/listings/${l.id}/applications`)
      .then((d) => {
        setApps(d.items || []);
        setCursor(d.cursor);
      })
      .catch((e) => setListError(e.message));
  }, [l.id]);
  return (
    <>
      <h1>{l.premisesAddress || l.item1?.premisesAddress}</h1>
      {l.jurisdiction === "NSW" && <p className="notice">{NSW_PROVISIONAL_BANNER}</p>}
      <p>
        {l.jurisdiction} · {label(l.status)}
      </p>
      {l.status === "draft" && <Link to={`/agent/listings/${l.id}/edit`}>Edit listing</Link>}
      {l.status === "draft" && (
        <button type="button" onClick={() => action(() => api(`/listings/${l.id}/publish`, "POST", {}))}>
          Publish
        </button>
      )}
      {l.slug && (
        <p>
          Apply link:{" "}
          <a href={`/apply/${l.slug}`}>
            {location.origin}/apply/{l.slug}
          </a>{" "}
          <button
            type="button"
            className="text"
            onClick={() => navigator.clipboard.writeText(`${location.origin}/apply/${l.slug}`)}
          >
            Copy
          </button>
        </p>
      )}
      <p>
        <Link to={`/agent/listings/${l.id}/close`}>Close listing</Link>
      </p>
      <h2>Applications</h2>
      {listError && <p role="alert">{listError}</p>}
      {apps.length ? (
        <ul>
          {apps.map((a: any) => (
            <li key={a.id}>
              {!["successful", "unsuccessful", "withdrawn", "purged"].includes(a.status) && (
                <label>
                  <input
                    className="check"
                    type="checkbox"
                    checked={selected.includes(a.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? [...selected, a.id] : selected.filter((id) => id !== a.id),
                      )
                    }
                  />
                  Select application
                </label>
              )}
              <Link to={`/agent/applications/${a.id}`}>
                {a.payload?.jurisdiction === "VIC"
                  ? a.payload.applicant.item4.fullName
                  : a.payload?.applicant?.nsw?.applicant?.fullName || a.id}
              </Link>{" "}
              · {label(a.status)} · {a.submittedAt} {a.groupCode && <>· Group {a.groupCode}</>}
            </li>
          ))}
        </ul>
      ) : (
        <p>No applications.</p>
      )}
      {cursor && (
        <button type="button" className="secondary" onClick={() => load(cursor)}>
          Load more applications
        </button>
      )}
      <button
        type="button"
        className="secondary"
        disabled={!selected.length}
        onClick={async () => {
          const results = await Promise.allSettled(
            selected.map((id) => api(`/applications/${id}/transition`, "POST", { to: "unsuccessful" })),
          );
          const failed = results.filter((r) => r.status === "rejected").length;
          setSelected([]);
          await load();
          setListError(failed ? `${failed} application(s) could not be updated.` : "");
        }}
      >
        Mark selected unsuccessful
      </button>
    </>
  );
}
export function CloseListing({ data, action }: any) {
  const [outcome, setOutcome] = useState("leased"),
    [date, setDate] = useState(""),
    [end, setEnd] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [applications, setApplications] = useState<any[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loadError, setLoadError] = useState("");
  const load = (next?: string) =>
    api(`/listings/${data.id}/applications${next ? `?cursor=${encodeURIComponent(next)}` : ""}`)
      .then((d) => {
        setApplications((previous) => (next ? [...previous, ...d.items] : d.items || []));
        setCursor(d.cursor);
      })
      .catch((e) => setLoadError(e.message));
  useEffect(() => {
    api(`/listings/${data.id}/applications`)
      .then((d) => {
        setApplications(d.items || []);
        setCursor(d.cursor);
      })
      .catch((e) => setLoadError(e.message));
  }, [data.id]);
  return (
    <>
      <h1>Close listing</h1>
      <p>Closing schedules retention according to the application outcomes and the agency policy.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action(async () => {
            await api(`/listings/${data.id}/close`, "POST", {
              outcome,
              ...(outcome === "leased"
                ? {
                    agreementDate: date,
                    successfulApplicationIds: ids,
                    ...(end ? { tenancyEndDate: end } : {}),
                  }
                : {}),
            });
            location.href = `/agent/listings/${data.id}`;
          });
        }}
      >
        <label>
          Outcome
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="leased">Leased</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </label>
        {outcome === "leased" && (
          <>
            <label>
              Agreement date
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <fieldset>
              <legend>Successful applications</legend>
              <p>Mark applications successful first, then select every successful applicant.</p>
              {loadError && <p role="alert">{loadError}</p>}
              {applications
                .filter((a) => a.status === "successful")
                .map((a) => (
                  <label key={a.id}>
                    <input
                      className="check"
                      type="checkbox"
                      checked={ids.includes(a.id)}
                      onChange={(e) =>
                        setIds(e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id))
                      }
                    />
                    {a.payload?.jurisdiction === "VIC"
                      ? a.payload.applicant.item4.fullName
                      : a.payload?.applicant?.nsw?.applicant?.fullName || a.id}{" "}
                    · {label(a.status)}
                  </label>
                ))}
              {cursor && (
                <button type="button" className="secondary" onClick={() => load(cursor)}>
                  Load more applications
                </button>
              )}
            </fieldset>
            <label>
              Tenancy end date, if known
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </>
        )}
        {outcome === "leased" && date && (
          <section>
            <h2>Retention schedule</h2>
            {data.jurisdiction === "VIC" ? (
              <p>
                VIC legal deadline for unsuccessful applications:{" "}
                {addDays(date as `${number}-${number}-${number}`, 30)}; the configured policy may schedule an
                earlier purge.{" "}
                {end &&
                  `For successful applications, the legal deadline is ${addYears(end as `${number}-${number}-${number}`, 3)}.`}
              </p>
            ) : (
              <p>NSW retention rules are PROVISIONAL. The configured policy schedules purges.</p>
            )}
          </section>
        )}
        <button type="submit">Close listing</button>
      </form>
    </>
  );
}
export function Application({ data, id, action }: any) {
  const a = data.application || data;
  const [notice, setNotice] = useState(""),
    [method, setMethod] = useState("sighted_in_person"),
    [portal, setPortal] = useState(""),
    [noticeType, setNoticeType] = useState("outcome"),
    [delivery, setDelivery] = useState("applicant_portal");
  const premises = a.payload?.listing?.item1?.premisesAddress || "[premises]";
  const docTypes = a.payload?.listing?.item7Requested?.map(label).join(", ") || "[identity document types]";
  const noticeComplete = !!notice && !/\[[^\]]+\]/.test(notice);
  return (
    <>
      <h1>Application</h1>
      {(a.jurisdiction === "NSW" || a.payload?.jurisdiction === "NSW") && (
        <p className="notice">{NSW_PROVISIONAL_BANNER}</p>
      )}
      <p>Status: {label(a.status || "unknown")}</p>
      {a.groupCode && <p>Group code: {a.groupCode}</p>}
      <h2>Application details</h2>
      <Detail value={a.payload || a} />
      <h2>Actions</h2>
      <p>Choose a template, replace every bracketed field and review it before sending.</p>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          setNotice(
            `We intend to enter into a residential tenancy agreement with you for ${premises}, subject to verifying your identity. Under the Residential Tenancies Act 2010 (NSW) we may collect identity verification information only after giving you this notice. Please provide [number] of the following: ${docTypes}. We will sight your document and delete the copy after verification.`,
          )
        }
      >
        Use NSW intent template
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setNoticeType("vic_439d_database_listing");
          setNotice(
            "Tenancy database: [database name]. Information listed: [information listed]. Listed by: [person or organisation]. How to remove or amend this information: [instructions].",
          );
        }}
      >
        Use VIC database notice template
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setNoticeType("outcome");
          setNotice(
            `Your application for ${premises} was not successful. Your information will be destroyed by ${a.purgeDueAt || "[destruction date]"}.`,
          );
        }}
      >
        Use outcome template
      </button>
      <label>
        Notice to applicant
        <textarea value={notice} onChange={(e) => setNotice(e.target.value)} />
      </label>
      <label>
        Verification method
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="sighted_in_person">Sighted in person</option>
          <option value="document_review">Document review</option>
        </select>
      </label>
      {(a.allowedTransitions || []).map((to: string) => (
        <button
          type="button"
          key={to}
          disabled={to === "id_requested" && !noticeComplete}
          className="secondary"
          onClick={() =>
            action(async () => {
              const result = await api(`/applications/${id}/transition`, "POST", {
                to,
                ...(to === "id_requested" ? { notice: { body: notice } } : {}),
                ...(to === "id_verified" ? { verificationMethod: method } : {}),
              });
              if (result.portalPath) setPortal(location.origin + result.portalPath);
            })
          }
        >
          Mark {label(to)}
        </button>
      ))}
      {portal && (
        <p role="status">
          Share the new portal link with the applicant: <a href={portal}>{portal}</a>
        </p>
      )}
      <h2>Database check</h2>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          action(() =>
            api(`/applications/${id}/db-check`, "POST", {
              checkedAt: new Date().toISOString(),
              listingFound: false,
            }),
          )
        }
      >
        Record check: no listing found
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          action(() =>
            api(`/applications/${id}/db-check`, "POST", {
              checkedAt: new Date().toISOString(),
              listingFound: true,
            }),
          )
        }
      >
        Record check: listing found
      </button>
      <h2>Notice</h2>
      <label>
        Notice type
        <select value={noticeType} onChange={(e) => setNoticeType(e.target.value)}>
          <option value="outcome">Outcome</option>
          <option value="vic_439d_database_listing">VIC tenancy database listing</option>
        </select>
      </label>
      <label>
        Delivery
        <select value={delivery} onChange={(e) => setDelivery(e.target.value)}>
          <option value="applicant_portal">Applicant portal</option>
          <option value="manual">Delivered manually</option>
        </select>
      </label>
      <button
        type="button"
        className="secondary"
        disabled={!noticeComplete}
        onClick={() =>
          action(() =>
            api(`/applications/${id}/notices`, "POST", {
              type: noticeType,
              body: notice,
              delivery,
            }),
          )
        }
      >
        Record notice
      </button>
      <h2>Improper collection</h2>
      <button
        type="button"
        className="danger"
        onClick={() => {
          if (confirm("Flag the entire application as improperly collected?"))
            action(() => api(`/applications/${id}/flag-improper`, "POST", { entireApplication: true }));
        }}
      >
        Flag entire application
      </button>
      <h2>Documents</h2>
      {(a.documents || []).map((d: any) => (
        <p key={d.id}>
          <button
            type="button"
            className="text"
            onClick={() =>
              action(() => downloadAgent(`/applications/${id}/documents/${d.id}`, d.filename || "document"))
            }
          >
            {d.filename || label(d.type)}
          </button>{" "}
          <button
            type="button"
            className="text"
            onClick={() => {
              if (confirm("Flag this document as improperly collected?"))
                action(() => api(`/applications/${id}/flag-improper`, "POST", { documentIds: [d.id] }));
            }}
          >
            Flag improper
          </button>
        </p>
      ))}
      <p>
        <button
          type="button"
          className="text"
          onClick={() => action(() => downloadAgent(`/applications/${id}/export`, "application.json"))}
        >
          Export JSON
        </button>
      </p>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          action(async () => {
            const [regular, bold] = await Promise.all(
              ["/fonts/NotoSans-Regular.ttf", "/fonts/NotoSans-Bold.ttf"].map(async (u) => {
                const r = await fetch(u);
                if (!r.ok) throw Error("PDF fonts are unavailable.");
                return new Uint8Array(await r.arrayBuffer());
              }),
            );
            const payload = await api(`/applications/${id}/export?format=pdf-data`);
            const bytes = await renderApplicationPdf(payload, {
              fonts: { regular: regular!, bold: bold! },
              now: new Date(payload.generatedAt),
            });
            const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "application.pdf";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          })
        }
      >
        Download PDF
      </button>
      <h2>Consents</h2>
      <Records data={a.consents || []} />
      <h2>Correction requests</h2>
      <Records data={a.messages || []} />
      <h2>Timeline</h2>
      <Records data={a.audit || []} />
    </>
  );
}
function Detail({ value }: any) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  return (
    <dl>
      {Object.entries(value).map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{label(k)}</dt>
          <dd>
            <Detail value={v} />
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
const COLLECTION_NOTICE_TEMPLATE =
  "We collect the information in the application form to assess suitability for this property only. With your consent we may share it with the rental provider, referees and listed tenancy databases. We store encrypted information with Cloudflare; storage may be outside Australia. Unsuccessful applications are normally destroyed 14 days after agreement, successful files after a 30-day handoff, withdrawn files after 2 days, and identity copies immediately after verification or within 7 days. Use the applicant portal to access your information, request correction, withdraw or change optional retention consent. For complaints, contact us, then Consumer Affairs Victoria, NSW Fair Trading or the OAIC as applicable. Review this notice and our privacy policy before submitting.";
export function Settings({ data, action }: any) {
  const [details, setDetails] = useState(data.details || {}),
    [notice, setNotice] = useState(data.collectionNoticeMd || ""),
    [privacy, setPrivacy] = useState(data.privacyPolicyUrl || ""),
    [retention, setRetention] = useState(data.retentionPolicy || {}),
    [turnstile, setTurnstile] = useState(!!data.turnstileRequired),
    [staff, setStaff] = useState<any[]>([]),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("agent");
  useEffect(() => {
    api("/staff")
      .then((d) => setStaff(d.items || []))
      .catch(() => {});
  }, []);
  return (
    <>
      <h1>Agency settings</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action(() =>
            api("/settings", "PUT", {
              details,
              collectionNoticeMd: notice,
              privacyPolicyUrl: privacy || null,
              retentionPolicy: retention,
              turnstileRequired: turnstile,
            }),
          );
        }}
      >
        {["name", "acnOrAbn", "address", "phone", "email", "providerStateOrTerritory"].map((k) => (
          <label key={k}>
            {label(k)}
            <input
              value={details[k] || ""}
              onChange={(e) => setDetails({ ...details, [k]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Collection notice
          <textarea value={notice} onChange={(e) => setNotice(e.target.value)} />
        </label>
        <button type="button" className="secondary" onClick={() => setNotice(COLLECTION_NOTICE_TEMPLATE)}>
          Reset collection notice to template
        </button>
        <label>
          Privacy policy URL
          <input type="url" value={privacy} onChange={(e) => setPrivacy(e.target.value)} />
        </label>
        <h2>Retention policy</h2>
        <p>Policy must stay within legal deadlines. VIC: s 505BC; NSW settings are provisional.</p>
        {Object.entries(retention).map(([k, v]) =>
          typeof v === "number" ? (
            <label key={k}>
              {label(k)}
              <input
                type="number"
                min="0"
                max={
                  (
                    {
                      unsuccessfulDays: 28,
                      successfulHandoffDays: 90,
                      withdrawnDays: 7,
                      listingWithdrawnDays: 28,
                      identityDocMaxDays: 7,
                    } as Record<string, number>
                  )[k]
                }
                value={v}
                onChange={(e) => setRetention({ ...retention, [k]: Number(e.target.value) })}
              />
            </label>
          ) : typeof v === "boolean" ? (
            <label key={k}>
              <input
                className="check"
                type="checkbox"
                checked={v}
                onChange={(e) => setRetention({ ...retention, [k]: e.target.checked })}
              />
              {label(k)}
            </label>
          ) : null,
        )}
        <label>
          <input
            className="check"
            type="checkbox"
            checked={turnstile}
            onChange={(e) => setTurnstile(e.target.checked)}
          />
          Require Turnstile
        </label>
        <button type="submit">Save settings</button>
      </form>
      <h2>Staff</h2>
      {staff.map((member: any) => (
        <article key={member.id}>
          <p>
            {member.email} · {member.role} · {member.disabled ? "disabled" : "active"}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              action(async () => {
                await api(`/staff/${member.id}`, "PATCH", { disabled: !member.disabled });
                setStaff((await api("/staff")).items || []);
              })
            }
          >
            {member.disabled ? "Enable" : "Disable"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              action(async () => {
                await api(`/staff/${member.id}`, "PATCH", {
                  role: member.role === "admin" ? "agent" : "admin",
                });
                setStaff((await api("/staff")).items || []);
              })
            }
          >
            Change to {member.role === "admin" ? "agent" : "admin"}
          </button>
        </article>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action(async () => {
            await api("/staff", "POST", { email, role });
            setStaff((await api("/staff")).items || []);
            setEmail("");
          });
        }}
      >
        <label>
          Staff email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit">Add staff member</button>
      </form>
      <h2>Encryption keys</h2>
      <button
        type="button"
        className="secondary"
        onClick={() => action(() => api("/keys/rewrap", "POST", {}))}
      >
        Re-wrap data keys
      </button>
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
