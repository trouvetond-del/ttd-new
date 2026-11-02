# Architecture rules
- Paid-ad automation lives in scripts/sea-agent and its dedicated daily GitHub workflow; provider calls are read-only so campaigns cannot change without a separate explicit human action.
- SEA reports and decisions use separate admin-protected tables and a dedicated dashboard tab; database policies validate the admin identity and record decisions independently of client UI.
- SEA budget totals require successful reports from both providers in the same currency; missing provider data must remain unknown rather than count as zero.
- External credentials belong in GitHub Actions encrypted secrets, never source or workflow literals; rotate them independently of code.

- Homepage decorative video lives in HeroBackgroundVideo with immutable CDN pointers, silent inline playback, a pause control and reduced-motion/data-saving poster fallback; this preserves readability and avoids heavy repository binaries.
