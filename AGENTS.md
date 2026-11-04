# Architecture rules
- Marketing origin of a quote request is stored in quote_requests.acquisition_source, set from a 7-day localStorage marker at first real submission; admin conversion stats count only non-draft requests, a "real quote" being any mover quote row.
- Move-request references are allocated and reserved permanently by a database trigger with atomic unique claims; UI must read the stored reference, never derive one from UUIDs, to keep search/display consistent and prevent concurrent duplicates.
- Paid-ad automation lives in scripts/sea-agent and its dedicated daily GitHub workflow; provider calls are read-only so campaigns cannot change without a separate explicit human action.
- SEA reports and decisions use separate admin-protected tables and a dedicated dashboard tab; database policies validate the admin identity and record decisions independently of client UI.
- SEA budget totals require successful reports from both providers in the same currency; missing provider data must remain unknown rather than count as zero.
- External credentials belong in GitHub Actions encrypted secrets, never source or workflow literals; rotate them independently of code.

- Homepage decorative video lives in HeroBackgroundVideo with immutable CDN pointers, silent inline playback, a pause control and reduced-motion/data-saving poster fallback; this preserves readability and avoids heavy repository binaries.
- Storage-box partner outreach runs in the partner-outreach edge function (Gmail connector) driven by its own daily workflow; referral codes are attached only through a security-definer RPC for brand-new client accounts, and refunds are created solely from admin-approved completed paid moves, unique per client, so nobody is paid without a real move through the site.
