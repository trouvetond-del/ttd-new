# Architecture rules
- Marketing origin of a quote request is stored in quote_requests.acquisition_source, set from a 7-day localStorage marker at first real submission; admin conversion stats count only non-draft requests, a "real quote" being any mover quote row.
- Move-request references are allocated and reserved permanently by a database trigger with atomic unique claims; UI must read the stored reference, never derive one from UUIDs, to keep search/display consistent and prevent concurrent duplicates.
- Paid-ad automation lives in scripts/sea-agent and its dedicated daily GitHub workflow; provider calls are read-only so campaigns cannot change without a separate explicit human action.
- SEA reports and decisions use separate admin-protected tables and a dedicated dashboard tab; database policies validate the admin identity and record decisions independently of client UI.
- SEA budget totals require successful reports from both providers in the same currency; missing provider data must remain unknown rather than count as zero.
- External credentials belong in GitHub Actions encrypted secrets, never source or workflow literals; rotate them independently of code.

- Homepage decorative video lives in HeroBackgroundVideo with immutable CDN pointers, silent inline playback, a pause control and reduced-motion/data-saving poster fallback; this preserves readability and avoids heavy repository binaries.
- Storage-box partner outreach runs in the partner-outreach edge function (Gmail connector) driven by its own daily workflow; referral codes are attached only through a security-definer RPC for brand-new client accounts, and refunds are created solely from admin-approved completed paid moves, unique per client, so nobody is paid without a real move through the site.

- Homepage partner motion, FAQ and photo protection are isolated in HomeSections with CSS tokens, duplicated decorative tracks hidden from assistive technology, accessible pause controls and reduced-motion fallbacks; this keeps animations independent from acquisition and payment flows.

- Homepage intermediary and reassurance sections live in HomeTrust; the decorative journey loops after visibility with pause and reduced-motion support, independent of real validation and payment logic; preserve the how-it-works scroll target.
- Decorative motion-control visibility is centralized in motion-controls.css after index.css; opacity preserves hit areas and keyboard access while non-hover devices retain visible controls.
- The daily morning monitor lives in scripts/morning-monitor and its Actions workflow; read-only source checks distinguish missing, failed and unknown from success, with email acceptance and date-keyed provider deduplication through the existing authorized email function.
- Footer secondary city links use native details disclosure so crawlers retain every link without a large initial list.

- Quote-request deletion is metadata-only via admin-authorized trash/restore RPCs; IDs, references, statuses and related business rows stay intact, operational readers exclude trash, and financial/photo retention history remains independent.
- Footer city spelling is shared through city-links.json and filtered against published city_pages in both React and prerendering; commune links also require a published page, preventing broken internal links.
- The global noscript fallback uses a styled div instead of H1, leaving each page's React or prerendered content as its sole primary heading.

- Account email/phone and identical active move requests are reserved atomically in private identity-claim tables with database triggers; preserve historical duplicates and enforce protection across all writers, not just UI checks.
- Manual pending-quote reminders share one admin-authorized action across request and client dialogs; hesitation responses verify request ownership and send to the fixed team inbox, never accepting a browser-supplied recipient.

- Free-entry numeric fields use NumberInput editing buffers so clearing never forces default digits; mandatory mover profile integers keep raw drafts and validate before saving, with row-return checks preventing false success.
- Mover Groupage derives candidate pairs from list_open_moves safe projections and commune centres; never read admin groupage alerts or expose client contacts, and retain existing privacy-aware bid details and per-request acceptance.
- Vercel app rewrites must cover every client-router path prefix, including public move listings and driver pages, so hard refresh and emailed links do not return host 404s.
- Request action consistency is enforced by a transactional database trigger and deterministic audit RPC; operational readers refresh on realtime, local actions, cross-tab messages and focus, and verification failures never replay writes or claim success.
- Groupage invalidation is separate from manual dismissal, preserving history and reversible restoration while excluding deleted, draft, closed, expired or geometrically incompatible pairs from alerts and sends.
- Administrative list removal uses an admin-only reversible visibility ledger, not auth deletion; account/mover entries synchronize while contracts, signatures, payments and end-user access remain intact.
