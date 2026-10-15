/**
 * Reusable requirement, architecture and design templates per website category, built from feature modules.
 * Templates are starting points for the operator's Gate A and Gate B work, never a substitute for review.
 */

export type Capability = "backend" | "database" | "auth" | "payments" | "email" | "uploads";

export interface FeatureModule {
  id: string;
  title: string;
  description: string;
  /** Platform capabilities this module cannot work without. */
  requires: Capability[];
  /** Phrases in a request that suggest the module is wanted. */
  keywords: RegExp;
  /** Acceptance-criterion templates: each must be turned into a concrete automated test. */
  acceptance: string[];
  /** Human-in-the-loop trigger: enabling this module needs explicit Gate E approval first. */
  gateE?: string;
}

const m = (x: FeatureModule): [string, FeatureModule] => [x.id, x];

export const MODULES: Record<string, FeatureModule> = Object.fromEntries([
  m({ id: "seo-metadata", title: "SEO metadata", description: "Titles, descriptions, canonical and social tags per page.", requires: [], keywords: /\bseo\b|\bsearch engines?\b/i,
    acceptance: ["Every route has a unique <title> and meta description (verified by E2E)."] }),
  m({ id: "contact-form", title: "Contact form", description: "Validated form that delivers a message to the site owner.", requires: ["backend", "email"], keywords: /\bcontact( form)?\b|\bget in touch\b|\binquir/i,
    acceptance: ["Invalid input shows field-level errors and sends nothing.", "A valid submission shows a success state and is delivered to the configured inbox (or stored), verified against a test double.", "Server-side validation rejects oversize and malformed payloads."],
    gateE: "Sends messages to real people: needs an approved email provider, recipient and rate limit." }),
  m({ id: "project-gallery", title: "Project gallery", description: "Filterable showcase of work with detail views.", requires: [], keywords: /\bgallery\b|\bprojects?\b|\bwork samples?\b|\bshowcase\b/i,
    acceptance: ["Each item opens a detail view with a working back link.", "Filtering by tag updates the list and shows an empty state when nothing matches.", "Images have alt text and are lazy-loaded."] }),
  m({ id: "blog-posts", title: "Posts", description: "Article list, article pages, tags and reading time.", requires: [], keywords: /\bblog\b|\barticles?\b|\bposts?\b/i,
    acceptance: ["Post list links to post pages by stable URL.", "Unknown slugs show a not-found page.", "Post pages have semantic headings and metadata."] }),
  m({ id: "email-notifications", title: "Email notifications", description: "Transactional emails such as confirmations and reminders.", requires: ["backend", "email"], keywords: /\breminders?\b|\bnotifications?\b|\bconfirmation emails?\b|\bemails?\b/i,
    acceptance: ["An email is sent only as a result of that user's own action or explicit opt-in.", "Send failures are retried a bounded number of times and never block the user's action.", "Each email carries a way to manage or stop further messages, and contains no secrets."],
    gateE: "Sends messages to real users: needs an approved email provider, sender identity, templates and rate limits before any live send." }),
  m({ id: "newsletter-signup", title: "Newsletter signup", description: "Collects email addresses for a mailing list.", requires: ["backend", "email", "database"], keywords: /\bnewsletter\b|\bsubscribe\b|\bwaitlist\b|\bmailing list\b/i,
    acceptance: ["Invalid emails are rejected client- and server-side.", "Duplicate signups are handled without an error leak.", "A consent statement is shown next to the field."],
    gateE: "Collects and stores personal data and may message real users: needs privacy text, storage plan and sender approval." }),
  m({ id: "auth", title: "Accounts and sign-in", description: "Registration, login, logout and protected routes.", requires: ["backend", "database", "auth"], keywords: /\b(auth(entication)?|log-?in|sign[- ]?(in|up)|accounts?|users?)\b/i,
    acceptance: ["Protected routes redirect anonymous visitors to sign-in.", "Authorization is enforced on the server for every protected operation (tested with another user's id).", "Passwords and tokens never appear in logs or client code."] }),
  m({ id: "product-catalog", title: "Product catalog", description: "Browsable products with search, filters and detail pages.", requires: [], keywords: /\bproducts?\b|\bcatalog\b|\bshop\b|\bstore\b/i,
    acceptance: ["Search and category filters combine and show an empty state.", "Product pages show price, availability and images with alt text.", "Prices are formatted per locale and never computed in floating point."] }),
  m({ id: "cart", title: "Cart", description: "Add, remove and change quantities with totals.", requires: [], keywords: /\bcart\b|\bbasket\b/i,
    acceptance: ["Quantity changes update line and order totals exactly (integer minor units).", "The cart survives reload.", "Out-of-range quantities are rejected."] }),
  m({ id: "checkout-payments", title: "Checkout and payments", description: "Order capture and payment through a hosted payment provider.", requires: ["backend", "database", "payments"], keywords: /\bcheckout\b|\bpayments?\b|\bstripe\b|\bbilling\b/i,
    acceptance: ["Card data never touches the site's own server (hosted fields or redirect only).", "Order totals are recomputed on the server, not trusted from the client.", "Payment webhooks are signature-verified and idempotent."],
    gateE: "Handles money: needs an approved payment provider account, test-mode proof, and sign-off before live keys are used." }),
  m({ id: "booking-calendar", title: "Booking calendar", description: "Select an available slot and confirm a booking.", requires: ["backend", "database"], keywords: /\bbooking\b|\bappointments?\b|\breservations?\b|\bschedul/i,
    acceptance: ["A slot cannot be booked twice (tested with concurrent requests).", "Times are stored in UTC and shown in the visitor's timezone, including across DST changes.", "Booking confirmation and cancellation both work and update availability."] }),
  m({ id: "admin-dashboard", title: "Admin dashboard", description: "Role-restricted area to manage content or data.", requires: ["backend", "database", "auth"], keywords: /\badmin\b|\bback-?office\b|\bmanage\b/i,
    acceptance: ["Non-admin users receive 403 on every admin endpoint (tested).", "Destructive actions require confirmation and are logged."] }),
  m({ id: "data-charts", title: "Data tables and charts", description: "Sortable tables and accessible charts for metrics.", requires: [], keywords: /\bcharts?\b|\bgraphs?\b|\bmetrics\b|\banalytics\b|\bdashboard\b/i,
    acceptance: ["Every chart has a text or table alternative.", "Empty, loading and error states exist for each data view.", "Sorting and filtering are keyboard operable."] }),
  m({ id: "listings", title: "Listings with seller and buyer roles", description: "Users create listings; others browse and contact them.", requires: ["backend", "database", "auth", "uploads"], keywords: /\blistings?\b|\bsellers?\b|\bbuyers?\b|\bmarketplace\b/i,
    acceptance: ["Only a listing's owner can edit or delete it (tested with another user).", "Uploads are type- and size-checked on the server.", "Reported listings can be hidden by an admin."],
    gateE: "Publishes user-generated content to the public: needs moderation and abuse handling approved first." }),
  m({ id: "local-persistence", title: "Local persistence with export", description: "Data kept in the browser with validated JSON export and import.", requires: [], keywords: /\b(local|browser|offline)\b|\bexport\b|\bimport\b/i,
    acceptance: ["Data survives reload.", "Corrupt stored data does not crash the app.", "Import is schema-validated and changes nothing on failure."] }),
  m({ id: "search-filter", title: "Search and filter", description: "Text search combined with filters.", requires: [], keywords: /\bsearch\b|\bfilter\b/i,
    acceptance: ["Search is case-insensitive and combines with filters.", "No results shows an empty state with a way to clear filters."] }),
]);

export interface CategoryTemplate {
  category: string;
  audience: string;
  journeys: string[];
  /** Module ids built for the MVP. */
  mvp: string[];
  optional: string[];
  future: string[];
  architecture: { style: string; stack: string; backend: boolean; database: "none" | "browser" | "sqlite" | "postgres"; notes: string };
  design: { tone: string; layout: string; typography: string; priority: string };
  nonFunctional: string[];
  risks: { risk: string; severity: "low" | "medium" | "high"; mitigation: string }[];
}

const COMMON_NFR = [
  "WCAG 2.2 AA: keyboard operable, visible focus, labelled controls, contrast checked, reduced motion respected.",
  "Responsive at 375, 768 and 1280 px with no horizontal scroll.",
  "No secrets in client code; strict Content-Security-Policy; dependencies audited before release.",
  "Initial JavaScript under 200 KB gzipped unless the plan justifies more.",
];

export const TEMPLATES: Record<string, CategoryTemplate> = {
  portfolio: {
    category: "portfolio",
    audience: "Recruiters, clients and peers deciding in under a minute whether to get in touch.",
    journeys: ["Land, understand who this is, open one project, then contact.", "Skim on a phone from a shared link."],
    mvp: ["project-gallery", "contact-form", "seo-metadata"], optional: ["blog-posts"], future: ["newsletter-signup"],
    architecture: { style: "Static site (SPA or static generation)", stack: "React + Vite, content in typed data files", backend: false, database: "none", notes: "The contact form needs one small serverless endpoint or a form provider; keep everything else static." },
    design: { tone: "Personal, confident, editorial", layout: "Hero identity statement, project grid, case-study pages, single clear contact call to action", typography: "Strong display face for the name and headings, calm body face; limited palette with one accent", priority: "Identity, project presentation and readability" },
    nonFunctional: [...COMMON_NFR, "Largest Contentful Paint under 2.5 s on a mid-range phone."],
    risks: [{ risk: "Placeholder or unlicensed project images", severity: "medium", mitigation: "Use only owned or properly licensed assets; alt text for each" }, { risk: "Contact form abuse (spam)", severity: "medium", mitigation: "Server-side validation, rate limit, honeypot" }],
  },
  "landing page": {
    category: "landing page",
    audience: "Prospective customers evaluating one offer and deciding whether to act.",
    journeys: ["Read the promise, check proof, click the main call to action.", "Join the waitlist or contact sales from a campaign link."],
    mvp: ["newsletter-signup", "seo-metadata"], optional: ["contact-form"], future: ["blog-posts"],
    architecture: { style: "Static site", stack: "React + Vite or plain static HTML", backend: false, database: "none", notes: "Signup needs a storage-backed endpoint or an approved form provider; no other server needed." },
    design: { tone: "Clear, trustworthy, benefit-led", layout: "Promise, proof, how it works, pricing or offer, repeated call to action", typography: "High-contrast headline scale, short line lengths", priority: "Messaging, trust and conversion" },
    nonFunctional: [...COMMON_NFR, "Social share tags render a correct preview."],
    risks: [{ risk: "Unsupported marketing claims", severity: "medium", mitigation: "Operator supplies and verifies every claim and testimonial" }, { risk: "Collecting emails without consent text", severity: "high", mitigation: "Consent statement and stated retention; Gate E before launch" }],
  },
  blog: {
    category: "blog",
    audience: "Readers arriving from search or links who want to read and sometimes subscribe.",
    journeys: ["Find a post, read it comfortably, discover related posts.", "Subscribe for updates."],
    mvp: ["blog-posts", "search-filter", "seo-metadata"], optional: ["newsletter-signup"], future: ["auth"],
    architecture: { style: "Static generation from files", stack: "React + Vite with content in Markdown or typed data", backend: false, database: "none", notes: "Prefer build-time content; add a CMS only if non-developers must publish." },
    design: { tone: "Quiet, typographic, reading-first", layout: "Readable single column, clear post list, tags", typography: "Serif or humanist body at 18-20 px, generous line height", priority: "Readability and discoverability" },
    nonFunctional: [...COMMON_NFR, "Each post has stable URL, title, description and structured heading order."],
    risks: [{ risk: "Unsanitised Markdown or HTML in posts", severity: "high", mitigation: "Render through a sanitising pipeline; never dangerouslySetInnerHTML with raw input" }],
  },
  "e-commerce": {
    category: "e-commerce",
    audience: "Shoppers comparing products and completing a purchase with confidence.",
    journeys: ["Browse, filter, view a product, add to cart, check out.", "Return later and find their order."],
    mvp: ["product-catalog", "cart", "search-filter", "seo-metadata"], optional: ["auth"], future: ["checkout-payments", "admin-dashboard"],
    architecture: { style: "Storefront plus hosted payment provider", stack: "React + Vite or Next.js, a small API for orders", backend: true, database: "postgres", notes: "Payments must use a hosted provider; totals are recomputed on the server. Real checkout is a Gate E action." },
    design: { tone: "Clear, tactile, trustworthy", layout: "Product grid with filters, rich product pages, persistent cart summary", typography: "Legible prices and labels, strong hierarchy", priority: "Product discovery, clear pricing, cart behaviour and safe checkout" },
    nonFunctional: [...COMMON_NFR, "Prices use integer minor units; no floating-point money."],
    risks: [{ risk: "Money handling errors", severity: "high", mitigation: "Integer minor units, server-side totals, provider-hosted card fields" }, { risk: "Spending money or going live with payments without approval", severity: "high", mitigation: "Gate E; test-mode proof first" }, { risk: "Stock or price drift between client and server", severity: "medium", mitigation: "Server is the source of truth" }],
  },
  marketplace: {
    category: "marketplace",
    audience: "Two sides: sellers who list items and buyers who find and contact them.",
    journeys: ["Seller signs up, creates a listing with photos.", "Buyer searches, filters and contacts the seller."],
    mvp: ["auth", "listings", "search-filter", "seo-metadata"], optional: ["admin-dashboard"], future: ["checkout-payments"],
    architecture: { style: "Modular monolith with managed auth and storage", stack: "React + Vite, API with Postgres and object storage (e.g. Supabase)", backend: true, database: "postgres", notes: "Row-level authorisation on every listing operation; uploads scanned by type and size." },
    design: { tone: "Busy but orderly, trust-building", layout: "Search-first home, listing cards, seller profile", typography: "Dense but legible lists", priority: "Discovery, trust signals and seller onboarding" },
    nonFunctional: [...COMMON_NFR, "Moderation path for reported content before public launch."],
    risks: [{ risk: "Insecure direct object references on listings", severity: "high", mitigation: "Server-side ownership checks with tests using a second user" }, { risk: "Abusive user-generated content", severity: "high", mitigation: "Report, hide and review flow; Gate E before opening to the public" }],
  },
  "booking system": {
    category: "booking system",
    audience: "Customers who want to book a slot quickly, and staff who manage availability.",
    journeys: ["Pick a service and slot, confirm, receive confirmation.", "Cancel or reschedule."],
    mvp: ["booking-calendar", "auth", "seo-metadata"], optional: ["admin-dashboard", "contact-form"], future: ["checkout-payments", "newsletter-signup"],
    architecture: { style: "Modular monolith", stack: "React + Vite, API with Postgres", backend: true, database: "postgres", notes: "Double-booking prevention must be a database constraint, not only application logic." },
    design: { tone: "Calm, efficient, reassuring", layout: "Stepwise booking flow with a persistent summary", typography: "Clear date and time presentation", priority: "Task efficiency and error recovery" },
    nonFunctional: [...COMMON_NFR, "All times stored in UTC, displayed in the visitor's timezone."],
    risks: [{ risk: "Double bookings under concurrency", severity: "high", mitigation: "Unique constraint on slot plus concurrent-request test" }, { risk: "Timezone and DST errors", severity: "high", mitigation: "UTC storage; table-driven tests across DST changes" }],
  },
  "saas dashboard": {
    category: "saas dashboard",
    audience: "Signed-in users who check metrics and act on them every day.",
    journeys: ["Sign in, see the key numbers, drill into one, take action.", "Recover from empty, error and expired-session states."],
    mvp: ["auth", "data-charts", "search-filter"], optional: ["admin-dashboard"], future: ["checkout-payments"],
    architecture: { style: "Modular monolith", stack: "React + Vite, API with Postgres", backend: true, database: "postgres", notes: "Per-tenant authorisation on every query; rate limiting on the API." },
    design: { tone: "Dense, calm, information-first", layout: "Sidebar navigation, summary cards, tables and charts", typography: "Tabular figures, compact scale", priority: "Information hierarchy and task efficiency" },
    nonFunctional: [...COMMON_NFR, "Every data view has loading, empty and error states."],
    risks: [{ risk: "Tenant data leakage", severity: "high", mitigation: "Server-side tenant scoping tested with two tenants" }, { risk: "Charts inaccessible to assistive tech", severity: "medium", mitigation: "Table alternatives and text summaries" }],
  },
  "internal tool": {
    category: "internal tool",
    audience: "A known group of staff completing repetitive work faster.",
    journeys: ["Sign in, find a record, update it, confirm the change.", "Export a report."],
    mvp: ["auth", "search-filter", "admin-dashboard"], optional: ["data-charts"], future: [],
    architecture: { style: "Modular monolith behind single sign-on where possible", stack: "React + Vite, API with SQLite or Postgres", backend: true, database: "sqlite", notes: "Prefer the simplest store that fits; audit log for changes." },
    design: { tone: "Utilitarian, fast, keyboard-friendly", layout: "Table-centric with bulk actions and inline editing", typography: "Compact, high legibility", priority: "Speed and error prevention" },
    nonFunctional: [...COMMON_NFR, "Audit trail for every data change."],
    risks: [{ risk: "Sensitive business data exposure", severity: "high", mitigation: "Least-privilege roles; Gate E before any data export" }],
  },
  "web application": {
    category: "web application",
    audience: "People who need a focused tool for one job.",
    journeys: ["Open the app, complete the core task in a few steps, come back later and find their data."],
    mvp: ["local-persistence", "search-filter"], optional: [], future: ["auth"],
    architecture: { style: "Client-only single-page app until a requirement needs a server", stack: "React + Vite + TypeScript", backend: false, database: "browser", notes: "Add a backend only when sharing across devices or accounts is required; the storage adapter is the seam." },
    design: { tone: "Calm, purposeful", layout: "Focused primary screen with simple navigation", typography: "System or one distinctive display face", priority: "Core task efficiency" },
    nonFunctional: COMMON_NFR,
    risks: [{ risk: "Data loss when stored only in the browser", severity: "medium", mitigation: "Export and import; say so in the UI" }],
  },
};

export function templateFor(category: string): CategoryTemplate {
  return TEMPLATES[category] ?? TEMPLATES["web application"]!;
}

export interface ModuleSelection {
  mvp: FeatureModule[];
  optional: FeatureModule[];
  future: FeatureModule[];
  /** Modules the request text asks for that the template does not list as MVP. */
  requested: FeatureModule[];
  capabilities: Capability[];
  gateE: { module: string; reason: string }[];
}

/** Combine the category template with what the request actually mentions. Unknown module ids are ignored. */
export function selectModules(request: string, tpl: CategoryTemplate): ModuleSelection {
  const get = (ids: string[]) => ids.map((id) => MODULES[id]).filter((x): x is FeatureModule => !!x);
  const mvp = get(tpl.mvp);
  const optional = get(tpl.optional);
  const future = get(tpl.future);
  const listed = new Set([...mvp, ...optional, ...future].map((x) => x.id));
  const requested = Object.values(MODULES).filter((x) => !listed.has(x.id) && x.keywords.test(request));
  // A module the request asks for explicitly is promoted out of "future" into the plan to be confirmed.
  const promoted = future.filter((x) => x.keywords.test(request));
  const planned = [...mvp, ...promoted, ...requested];
  const capabilities = [...new Set(planned.flatMap((x) => x.requires))];
  const gateE = planned.filter((x) => x.gateE).map((x) => ({ module: x.id, reason: x.gateE! }));
  return { mvp, optional, future: future.filter((x) => !promoted.includes(x)), requested: [...promoted, ...requested], capabilities, gateE };
}
