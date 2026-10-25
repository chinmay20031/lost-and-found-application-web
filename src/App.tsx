import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { isSupabaseConfigured, supabase } from "./supabase";

type Client = SupabaseClient<Database>;
type Report = Database["public"]["Tables"]["reports"]["Row"];
type Claim = Database["public"]["Functions"]["report_claims"]["Returns"][number];
type MyClaim = Database["public"]["Functions"]["my_claims"]["Returns"][number];
type Filter = "All" | "Lost" | "Found" | "Resolved";
type AuthMode = "signin" | "signup" | "reset";

const categories = [
  "Electronics",
  "Bags & accessories",
  "Clothing",
  "Keys & cards",
  "Pets",
  "Documents",
  "Other",
];
const photoLimit = 5 * 1024 * 1024;
const reportFields =
  "id,reporter_id,type,name,category,location,event_date,description,image_path,status,created_at";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong. Please try again.";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function Icon({ name, size = 18 }: { name: "pin" | "search" | "spark" | "close" | "leaf"; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "pin") return <svg {...common}><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
  if (name === "close") return <svg {...common}><path d="m18 6-12 12M6 6l12 12" /></svg>;
  if (name === "leaf") return <svg {...common}><path d="M20 4c-8 0-13 3-13 9a5 5 0 0 0 5 5c6 0 8-6 8-14Z" /><path d="M4 21c2-5 6-8 11-11" /></svg>;
  return <svg {...common}><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>;
}

function App() {
  if (!isSupabaseConfigured || !supabase) return <SetupNotice />;
  return <Goodfind client={supabase} />;
}

function SetupNotice() {
  return (
    <main className="setup-page">
      <div className="setup-card">
        <Brand />
        <p className="eyebrow">One small setup step</p>
        <h1>Connect Goodfind to your community.</h1>
        <p>Add the public Supabase project URL and anon or publishable key to <code>web/.env.local</code>, then restart the dev server.</p>
        <pre>VITE_SUPABASE_URL=https://your-project.supabase.co{"\n"}VITE_SUPABASE_ANON_KEY=your-public-key</pre>
        <p className="fine-print">Use the same Supabase project as the Android app. Never place a service-role or secret key in browser code.</p>
      </div>
    </main>
  );
}

function Goodfind({ client }: { client: Client }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [myClaims, setMyClaims] = useState<MyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [contactByClaim, setContactByClaim] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data, error } = await client
      .from("reports")
      .select(reportFields)
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      setReports([]);
      setLoading(false);
      return;
    }
    setReports(data ?? []);
    if (user) {
      const { data: claims, error: claimsError } = await client.rpc("my_claims");
      if (claimsError) {
        setLoadError(claimsError.message);
        setMyClaims([]);
      } else {
        setMyClaims(claims ?? []);
      }
    } else {
      setMyClaims([]);
    }
    setLoading(false);
  }, [client, user]);

  useEffect(() => {
    let active = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setNotice(error.message);
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: listener } = client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (authReady) void refresh();
  }, [authReady, refresh]);

  const visibleReports = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return reports.filter((report) => {
      const matchesFilter =
        filter === "All" ||
        (filter === "Resolved" ? report.status === "resolved" : report.status === "active" && report.type === filter);
      const matchesQuery =
        !needle ||
        [report.name, report.category, report.location, report.description]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, reports]);
  const activeCount = reports.filter((report) => report.status === "active").length;

  const handleClaim = async (report: Report, details: string) => {
    if (!user) throw new Error("Sign in to submit a claim.");
    const { error } = await client.from("claims").insert({
      report_id: report.id,
      claimant_id: user.id,
      details,
    });
    if (error) throw error;
    await refresh();
  };

  const showContact = async (claimId: string) => {
    setBusyAction(claimId);
    setNotice("");
    const { data, error } = await client.rpc("accepted_contact", { p_claim_id: claimId });
    if (error) setNotice(error.message);
    else setContactByClaim((current) => ({ ...current, [claimId]: data.contact }));
    setBusyAction("");
  };

  const confirmHandover = async (claimId: string) => {
    setBusyAction(claimId);
    setNotice("");
    const { error } = await client.rpc("confirm_handover", { p_claim_id: claimId });
    if (error) setNotice(error.message);
    else await refresh();
    setBusyAction("");
  };

  const changeStatus = async (report: Report, status: "active" | "resolved") => {
    setBusyAction(report.id);
    setNotice("");
    const { error } = await client.rpc("update_report_status", {
      p_report_id: report.id,
      p_status: status,
    });
    if (error) setNotice(error.message);
    else await refresh();
    setBusyAction("");
  };

  const deleteReport = async (report: Report) => {
    if (!window.confirm(`Delete “${report.name}”? This permanently removes its claims${report.image_path ? " and photo" : ""}.`)) return;
    setBusyAction(report.id);
    setNotice("");
    if (report.image_path) {
      const { error: storageError } = await client.storage.from("report-images").remove([report.image_path]);
      if (storageError) {
        setNotice(`The photo could not be deleted, so the report was kept. ${storageError.message}`);
        setBusyAction("");
        return;
      }
    }
    const { data, error } = await client.from("reports").delete().eq("id", report.id).select("id");
    if (error) {
      setNotice(`The photo was removed, but the report could not be deleted. ${error.message}`);
      setBusyAction("");
      return;
    }
    if (!data?.length) {
      setNotice("The photo was removed, but the report was not deleted. It may no longer belong to your account.");
      setBusyAction("");
      return;
    }
    await refresh();
    setBusyAction("");
  };

  const signOut = async () => {
    setNotice("");
    const { error } = await client.auth.signOut();
    if (error) setNotice(error.message);
  };

  const openSignIn = () => {
    setAuthMode("signin");
    setAuthOpen(true);
  };

  if (!authReady) {
    return <div className="app-loading" role="status">Loading Goodfind…</div>;
  }

  return (
    <>
      <div className="site-shell">
        <header className="topbar">
          <a className="brand-link" href="#" aria-label="Goodfind home"><Brand /></a>
          <nav className="topbar-actions" aria-label="Account">
            {user ? (
              <>
                <span className="signed-in">Signed in as <strong>{user.email}</strong></span>
                <button className="button button-quiet" onClick={() => void signOut()}>Sign out</button>
              </>
            ) : (
              <button className="button button-quiet" onClick={openSignIn}>Sign in</button>
            )}
            <button className="button button-primary top-post" onClick={() => user ? setReportOpen(true) : openSignIn()}>
              <span aria-hidden="true">＋</span> Post a report
            </button>
          </nav>
        </header>

        <main>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow"><Icon name="leaf" size={15} /> GOOD THINGS FIND THEIR WAY BACK</p>
              <h1>Lost something?<br /><em>Found something?</em></h1>
              <p className="hero-subtitle">A little kindness goes a long way. Help your neighbors reconnect with the things that matter.</p>
              <button className="button button-primary hero-button" onClick={() => user ? setReportOpen(true) : openSignIn()}>
                Share a lost or found item <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="sun-orbit" />
              <div className="art-card art-card-back"><span className="art-dot" /><span /><span /></div>
              <div className="art-card art-card-front">
                <div className="art-image"><Icon name="spark" size={30} /></div>
                <div className="art-lines"><b /><span /><span /></div>
                <div className="art-tag">FOUND</div>
              </div>
              <div className="art-leaf"><Icon name="leaf" size={40} /></div>
              <div className="orbit-dot orbit-dot-one" />
              <div className="orbit-dot orbit-dot-two" />
            </div>
          </section>

          <section className="community-strip" aria-label="Community overview">
            <div className="community-blurb"><span className="community-icon"><Icon name="spark" size={17} /></span><span><strong>A community that cares</strong><small>Small acts. Big reunions.</small></span></div>
            <div className="stat"><strong>{activeCount}</strong><span>active reports</span></div>
            <div className="stat"><strong>{reports.length}</strong><span>shared so far</span></div>
            <p className="privacy-note">Your contact info stays private until a claim is accepted.</p>
          </section>

          <section className="browse-section" aria-labelledby="browse-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">THE COMMUNITY BOARD</p>
                <h2 id="browse-title">A little looking can mean a lot.</h2>
              </div>
              <label className="search-box">
                <Icon name="search" size={18} />
                <span className="sr-only">Search reports</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items, places…" />
                {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><Icon name="close" size={16} /></button>}
              </label>
            </div>

            <div className="browse-toolbar">
              <div className="filters" role="group" aria-label="Filter reports">
                {(["All", "Lost", "Found", "Resolved"] as Filter[]).map((value) => (
                  <button key={value} className={`filter-chip ${filter === value ? "selected" : ""}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                    {value === "All" ? "All reports" : value}
                  </button>
                ))}
              </div>
              <span className="result-count">{visibleReports.length} {visibleReports.length === 1 ? "report" : "reports"}</span>
            </div>

            {notice && <div className="notice notice-error" role="alert">{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><Icon name="close" size={16} /></button></div>}
            {loading ? (
              <div className="report-grid" aria-label="Loading reports">{[1, 2, 3].map((item) => <div className="skeleton-card" key={item} />)}</div>
            ) : loadError ? (
              <div className="state-card error-state" role="alert"><span className="state-mark">!</span><h3>We couldn’t load the board.</h3><p>{loadError}</p><button className="button button-outline" onClick={() => void refresh()}>Try again</button></div>
            ) : visibleReports.length ? (
              <div className="report-grid">
                {visibleReports.map((report) => (
                  <ReportCard
                    key={report.id}
                    client={client}
                    report={report}
                    user={user}
                    myClaims={myClaims.filter((claim) => claim.report_id === report.id)}
                    contactByClaim={contactByClaim}
                    busyAction={busyAction}
                    onClaim={handleClaim}
                    onShowContact={showContact}
                    onConfirm={confirmHandover}
                    onChangeStatus={changeStatus}
                    onDelete={deleteReport}
                    onSignIn={openSignIn}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            ) : (
              <div className="state-card empty-state"><span className="empty-art"><Icon name="spark" size={28} /></span><h3>{query ? "Nothing matches that search." : "No reports here just yet."}</h3><p>{query ? "Try a different item name or location." : "Be the first to share a lost or found item with your community."}</p>{!query && <button className="button button-outline" onClick={() => user ? setReportOpen(true) : openSignIn()}>Post the first report</button>}</div>
            )}
          </section>
        </main>
        <footer><Brand /><span>Made for the things we find—and the people we find them for.</span><a href="#browse-title">Back to top ↑</a></footer>
      </div>

      {authOpen && <AuthDialog client={client} mode={authMode} onModeChange={setAuthMode} onClose={() => setAuthOpen(false)} />}
      {reportOpen && user && <ReportDialog client={client} user={user} onClose={() => setReportOpen(false)} onCreated={() => { setReportOpen(false); void refresh(); setNotice("Your report is now on the community board."); }} />}
      {recovery && <PasswordRecovery client={client} onDone={() => setRecovery(false)} />}
    </>
  );
}

function Brand() {
  return <span className="brand"><span className="brand-mark"><Icon name="leaf" size={22} /></span><span>goodfind<span className="brand-period">.</span></span></span>;
}

function ReportCard({
  client,
  report,
  user,
  myClaims,
  contactByClaim,
  busyAction,
  onClaim,
  onShowContact,
  onConfirm,
  onChangeStatus,
  onDelete,
  onSignIn,
  onRefresh,
}: {
  client: Client;
  report: Report;
  user: User | null;
  myClaims: MyClaim[];
  contactByClaim: Record<string, string>;
  busyAction: string;
  onClaim: (report: Report, details: string) => Promise<void>;
  onShowContact: (claimId: string) => Promise<void>;
  onConfirm: (claimId: string) => Promise<void>;
  onChangeStatus: (report: Report, status: "active" | "resolved") => Promise<void>;
  onDelete: (report: Report) => Promise<void>;
  onSignIn: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [claimOpen, setClaimOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const isOwner = user?.id === report.reporter_id;
  const relatedClaim = myClaims.find((claim) => claim.status === "accepted") ?? myClaims[0];
  const imageUrl = report.image_path
    ? client.storage.from("report-images").getPublicUrl(report.image_path).data.publicUrl
    : "";
  const actionBusy = busyAction === report.id || relatedClaim?.claim_id === busyAction;
  const canResolve = isOwner && report.status === "active" && relatedClaim?.status !== "accepted";

  return (
    <article className="report-card">
      {report.image_path ? (
        <img className="report-image" src={imageUrl} alt={`Photo of ${report.name}`} loading="lazy" />
      ) : (
        <div className={`report-image-placeholder ${report.type.toLowerCase()}`} aria-hidden="true"><Icon name="spark" size={27} /></div>
      )}
      <div className="report-content">
        <div className="card-topline">
          <span className={`badge ${report.status === "resolved" ? "badge-resolved" : report.type === "Lost" ? "badge-lost" : "badge-found"}`}>
            {report.status === "resolved" ? "Resolved" : report.type}
          </span>
          <time dateTime={report.created_at}>{formatDate(report.created_at)}</time>
        </div>
        <h3>{report.name}</h3>
        <p className="report-meta"><span>{report.category}</span><span className="meta-dot">·</span><Icon name="pin" size={14} /><span>{report.location}</span></p>
        {report.description && <p className="report-description">{report.description}</p>}
        {report.event_date && <p className="event-date">Last seen / found · {report.event_date}</p>}

        {relatedClaim?.status === "accepted" && !isOwner && (
          <div className="private-contact">
            <span className="private-label">Your claim was accepted</span>
            {contactByClaim[relatedClaim.claim_id] ? (
              <p><strong>Contact:</strong> {contactByClaim[relatedClaim.claim_id]}</p>
            ) : (
              <button className="text-action" disabled={busyAction === relatedClaim.claim_id} onClick={() => void onShowContact(relatedClaim.claim_id)}>
                {busyAction === relatedClaim.claim_id ? "Loading…" : "View contact"}
              </button>
            )}
          </div>
        )}
        {relatedClaim?.status === "accepted" && !relatedClaim.claimant_confirmed && (
          <button className="button button-soft handover-button" disabled={actionBusy} onClick={() => void onConfirm(relatedClaim.claim_id)}>Confirm handover</button>
        )}
        {relatedClaim?.status === "accepted" && relatedClaim.claimant_confirmed && !relatedClaim.reporter_confirmed && !isOwner && (
          <p className="waiting-note">You’ve confirmed. Waiting for the report owner.</p>
        )}

        <div className="card-actions">
          {isOwner ? (
            <>
              <button className="button button-outline" onClick={() => setReviewOpen(true)}>Review claims</button>
              {canResolve ? (
                <button className="button button-quiet" disabled={actionBusy} onClick={() => void onChangeStatus(report, "resolved")}>Mark resolved</button>
              ) : null}
              {report.status === "resolved" && <button className="button button-quiet" disabled={actionBusy} onClick={() => void onChangeStatus(report, "active")}>Reopen</button>}
              {relatedClaim?.status === "accepted" && !relatedClaim.reporter_confirmed && (
                <button className="button button-soft" disabled={actionBusy} onClick={() => void onConfirm(relatedClaim.claim_id)}>Confirm handover</button>
              )}
              {relatedClaim?.status === "accepted" && relatedClaim.reporter_confirmed && !relatedClaim.claimant_confirmed && <span className="waiting-note">Waiting for claimant</span>}
              <button className="button button-danger-quiet" disabled={actionBusy} onClick={() => void onDelete(report)}>Delete</button>
            </>
          ) : report.status === "active" ? (
            user ? (
              myClaims.length ? <span className={`claim-state ${relatedClaim?.status ?? "pending"}`}>{relatedClaim?.status === "accepted" ? "Claim accepted" : relatedClaim?.status === "rejected" ? "Claim not accepted" : "Claim sent"}</span> :
                <button className="button button-primary card-claim" onClick={() => setClaimOpen(true)}>This is mine</button>
            ) : (
              <button className="button button-primary card-claim" onClick={onSignIn}>Sign in to claim</button>
            )
          ) : null}
        </div>
      </div>
      {claimOpen && <ClaimDialog report={report} onClose={() => setClaimOpen(false)} onSubmit={onClaim} />}
      {reviewOpen && <ReviewDialog client={client} report={report} onClose={() => setReviewOpen(false)} onRefresh={onRefresh} />}
    </article>
  );
}

function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={dialogRef}>
        <button className="modal-close" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
        {children}
      </div>
    </div>
  );
}

function AuthDialog({ client, mode, onModeChange, onClose }: {
  client: Client;
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) { setFeedback("Enter your email address."); setIsError(true); return; }
    if (mode !== "reset" && password.length < 8) { setFeedback("Use a password with at least 8 characters."); setIsError(true); return; }
    setBusy(true);
    setFeedback("");
    setIsError(false);
    try {
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) onClose();
        else {
          setPassword("");
          onModeChange("signin");
          setFeedback("Account created. Check your inbox for the email confirmation link, then sign in here.");
        }
      } else if (mode === "signin") {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onClose();
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        setFeedback("If an account exists for this address, a password reset email is on its way.");
        setPassword("");
      }
    } catch (error) {
      setFeedback(errorMessage(error));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={mode === "signup" ? "Create an account" : mode === "reset" ? "Reset your password" : "Sign in"} onClose={onClose} className="auth-modal">
      <div className="modal-brand"><Brand /></div>
      <p className="eyebrow">{mode === "signup" ? "JOIN YOUR COMMUNITY" : "WELCOME TO GOODFIND"}</p>
      <h2>{mode === "signup" ? "Make a little good happen." : mode === "reset" ? "A fresh start." : "Welcome back."}</h2>
      <p className="modal-intro">{mode === "signup" ? "Create an account to post reports and help reunite people with their belongings." : mode === "reset" ? "We’ll email you a secure link to choose a new password." : "Sign in to reconnect lost things with the people who care."}</p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="field-label" htmlFor="auth-email">Email address</label>
        <input id="auth-email" className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        {mode !== "reset" && <>
          <label className="field-label" htmlFor="auth-password">Password</label>
          <input id="auth-password" className="field" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
        </>}
        {feedback && <p className={`form-message ${isError ? "form-error" : "form-success"}`} role={isError ? "alert" : "status"}>{feedback}</p>}
        <button className="button button-primary form-submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
      </form>
      <div className="auth-links">
        {mode === "signin" && <button className="text-action" onClick={() => { setFeedback(""); onModeChange("reset"); }}>Forgot password?</button>}
        {mode === "reset" && <button className="text-action" onClick={() => { setFeedback(""); onModeChange("signin"); }}>Back to sign in</button>}
        {mode !== "reset" && <p>{mode === "signup" ? "Already have an account?" : "New to Goodfind?"} <button className="text-action" onClick={() => { setFeedback(""); onModeChange(mode === "signup" ? "signin" : "signup"); }}>{mode === "signup" ? "Sign in" : "Create an account"}</button></p>}
      </div>
      <p className="fine-print">Your contact information is shared only with the person whose claim you accept.</p>
    </Modal>
  );
}

function PasswordRecovery({ client, onDone }: { client: Client; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const update = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) { setMessage("Use a password with at least 8 characters."); setError(true); return; }
    setBusy(true);
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) {
      setMessage(updateError.message);
      setError(true);
      setBusy(false);
    } else {
      setMessage("Your password has been updated.");
      setError(false);
      setBusy(false);
      window.setTimeout(onDone, 1200);
    }
  };
  return (
    <Modal title="Choose a new password" onClose={onDone} className="auth-modal">
      <p className="eyebrow">ACCOUNT RECOVERY</p><h2>Choose a new password.</h2>
      <form onSubmit={(event) => void update(event)}>
        <label className="field-label" htmlFor="new-password">New password</label>
        <input id="new-password" className="field" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
        {message && <p className={`form-message ${error ? "form-error" : "form-success"}`} role={error ? "alert" : "status"}>{message}</p>}
        <button className="button button-primary form-submit" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
      </form>
    </Modal>
  );
}

function ReportDialog({ client, user, onClose, onCreated }: { client: Client; user: User; onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState<"Lost" | "Found">("Lost");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = useMemo(() => photo ? URL.createObjectURL(photo) : "", [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choosePhoto = (file?: File) => {
    setError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > photoLimit) {
      setError("Photos must be 5 MB or smaller.");
      return;
    }
    setPhoto(file);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (name.trim().length < 1 || name.trim().length > 100) { setError("Name must be 1–100 characters."); return; }
    if (!category || category.trim().length > 60) { setError("Choose a category."); return; }
    if (location.trim().length < 1 || location.trim().length > 200) { setError("Location must be 1–200 characters."); return; }
    if (description.length > 1000) { setError("Description must be 1,000 characters or fewer."); return; }
    if (contact.trim().length < 1 || contact.trim().length > 200) { setError("Contact details must be 1–200 characters."); return; }
    setBusy(true);
    let imagePath = "";
    let reportCreated = false;
    try {
      if (photo) {
        const extension = photo.type === "image/jpeg" ? "jpg" : photo.type === "image/png" ? "png" : "webp";
        imagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage.from("report-images").upload(imagePath, photo, {
          contentType: photo.type,
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) throw uploadError;
      }
      const { error: createError } = await client.rpc("create_report", {
        p_type: type,
        p_name: name.trim(),
        p_category: category,
        p_location: location.trim(),
        p_event_date: eventDate,
        p_description: description.trim(),
        p_contact: contact.trim(),
        p_image_path: imagePath,
      });
      if (createError) throw createError;
      reportCreated = true;
      onCreated();
    } catch (caught) {
      let message = errorMessage(caught);
      if (imagePath && !reportCreated) {
        try {
          const { error: cleanupError } = await client.storage.from("report-images").remove([imagePath]);
          if (cleanupError) message += ` The uploaded photo could not be cleaned up: ${cleanupError.message}`;
        } catch (cleanupError) {
          message += ` The uploaded photo could not be cleaned up: ${errorMessage(cleanupError)}`;
        }
      }
      setError(message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Create a report" onClose={onClose} className="report-modal">
      <p className="eyebrow">ADD TO THE COMMUNITY BOARD</p>
      <h2>Let’s bring it back together.</h2>
      <p className="modal-intro">Your description and photo are public. Keep private identifying clues for a claim.</p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="type-choice"><legend>What are you reporting?</legend>
          {(["Lost", "Found"] as const).map((value) => <button type="button" key={value} className={`type-option ${type === value ? "active" : ""}`} aria-pressed={type === value} onClick={() => setType(value)}>{value === "Lost" ? "I lost something" : "I found something"}</button>)}
        </fieldset>
        <div className="form-grid">
          <div className="form-field full"><label className="field-label" htmlFor="report-name">Item name *</label><input id="report-name" className="field" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Green canvas backpack" /></div>
          <div className="form-field"><label className="field-label" htmlFor="report-category">Category *</label><select id="report-category" className="field" required value={category} onChange={(event) => setCategory(event.target.value)}><option value="" disabled>Choose a category</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="form-field"><label className="field-label" htmlFor="report-location">Location *</label><input id="report-location" className="field" required maxLength={200} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Where was it seen?" /></div>
          <div className="form-field full"><label className="field-label" htmlFor="report-date">Date last seen / found</label><input id="report-date" className="field" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></div>
          <div className="form-field full"><label className="field-label" htmlFor="report-description">Description</label><textarea id="report-description" className="field textarea" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Share a helpful description—save identifying details for a private claim." rows={3} /><span className="character-count">{description.length}/1000</span></div>
          <div className="form-field full"><label className="field-label" htmlFor="report-contact">Your contact details * <span className="private-hint">private</span></label><input id="report-contact" className="field" required maxLength={200} value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Email, phone, or preferred way to reach you" /><span className="field-help">Only shared with the claimant after you accept their claim.</span></div>
          <div className="form-field full"><span className="field-label">Photo <span className="optional-label">optional · up to 5 MB</span></span>
            {photo && preview ? <div className="photo-preview"><img src={preview} alt="Selected report photo preview" /><button type="button" className="button button-quiet" onClick={() => setPhoto(null)}>Remove photo</button></div> : <label className="upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])} /><span className="upload-plus">＋</span><strong>Add a photo</strong><small>JPEG, PNG, or WebP</small></label>}
            <span className="field-help">Photos appear publicly with your report. Don’t include private clues or sensitive personal information.</span>
          </div>
        </div>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Posting…" : "Post report"}</button></div>
      </form>
    </Modal>
  );
}

function ClaimDialog({ report, onClose, onSubmit }: { report: Report; onClose: () => void; onSubmit: (report: Report, details: string) => Promise<void> }) {
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (details.trim().length < 8 || details.trim().length > 1000) { setError("Add 8–1,000 characters of identifying details."); return; }
    setBusy(true);
    setError("");
    try {
      await onSubmit(report, details.trim());
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };
  return <Modal title={`Claim ${report.name}`} onClose={onClose} className="auth-modal">
    <p className="eyebrow">PRIVATE CLAIM</p><h2>Know it’s yours?</h2>
    <p className="modal-intro">Share details only the true owner would know. The report owner will review this privately.</p>
    <form onSubmit={(event) => void submit(event)}>
      <label className="field-label" htmlFor="claim-details">Identifying details</label>
      <textarea id="claim-details" className="field textarea" required minLength={8} maxLength={1000} rows={5} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Describe details that aren’t in the public report…" />
      <span className="field-help">Only you and the report owner can see this.</span>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Sending…" : "Send claim privately"}</button></div>
    </form>
  </Modal>;
}

function ReviewDialog({ client, report, onClose, onRefresh }: { client: Client; report: Report; onClose: () => void; onRefresh: () => Promise<void> }) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await client.rpc("report_claims", { p_report_id: report.id });
    if (rpcError) setError(rpcError.message);
    else setClaims(data ?? []);
    setLoading(false);
  }, [client, report.id]);
  useEffect(() => { void load(); }, [load]);

  const review = async (claim: Claim, accept: boolean) => {
    setBusyId(claim.id);
    setError("");
    const { error: reviewError } = await client.rpc("review_claim", { p_claim_id: claim.id, p_accept: accept });
    if (reviewError) setError(reviewError.message);
    else {
      await load();
      await onRefresh();
    }
    setBusyId("");
  };

  return <Modal title={`Claims for ${report.name}`} onClose={onClose} className="review-modal">
    <p className="eyebrow">PRIVATE TO YOU</p><h2>Claims for {report.name}</h2>
    <p className="modal-intro">Identifying details are visible only to you as the report owner and the claimant.</p>
    {loading ? <p className="review-loading">Loading private claims…</p> : error ? <div className="form-message form-error" role="alert">{error}<button className="text-action" onClick={() => void load()}>Try again</button></div> : claims.length ? (
      <div className="claim-list">{claims.map((claim) => <article className="claim-item" key={claim.id}>
        <div className="claim-heading"><span className={`claim-state ${claim.status}`}>{claim.status}</span><time>{formatDate(claim.created_at)}</time></div>
        <p className="claim-details">{claim.details}</p>
        {claim.status === "pending" && <div className="claim-buttons"><button className="button button-outline" disabled={busyId === claim.id} onClick={() => void review(claim, false)}>Decline</button><button className="button button-primary" disabled={busyId === claim.id} onClick={() => void review(claim, true)}>{busyId === claim.id ? "Saving…" : "Accept claim"}</button></div>}
        {claim.status === "accepted" && <p className="field-help">{claim.reporter_confirmed ? "You confirmed the handover." : "Once you’ve handed over the item, confirm below."}{!claim.reporter_confirmed && <button className="text-action" disabled={busyId === claim.id} onClick={() => void (async () => { setBusyId(claim.id); const { error: confirmError } = await client.rpc("confirm_handover", { p_claim_id: claim.id }); if (confirmError) setError(confirmError.message); else { await load(); await onRefresh(); } setBusyId(""); })()}>Confirm handover</button>}</p>}
      </article>)}</div>
    ) : <div className="state-card compact-empty"><h3>No claims yet</h3><p>Claims will show up here when someone reaches out.</p></div>}
    <div className="modal-actions"><button className="button button-quiet" onClick={onClose}>Close</button></div>
  </Modal>;
}

export default App;
