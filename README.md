# WARDOGS Analytics Quota Optimization Patch

Apply this patch on top of the current v1.5 source tree.

## What changed

The highest-volume analytics events are now treated as session-level feature-usage signals instead of raw action counters:

- `calculation`: at most once per `map + weapon` context per browser-tab session.
- `origin-placed`: at most once per map per browser-tab session.
- `target-placed`: at most once per map per browser-tab session.
- `preset-marker-selected`: at most once per map per browser-tab session.

Deduplication keys are persisted in `sessionStorage`, so refreshing the same tab does not immediately resend the same high-volume events. A new tab starts a fresh budget. If `sessionStorage` is unavailable, in-memory deduplication still works for the lifetime of the page.

The calculation debounce was increased from 700 ms to 900 ms so transient drag states are less likely to become the first tracked calculation for a map/weapon context.

Rare, analytically useful events remain per-action and are not deduplicated.

## Expected effect

Using the recent Umami export as a replay sample, this policy would have reduced the four high-volume custom events from roughly 18.2k records to about 2.4k emitted events while preserving session-level feature adoption and the Origin -> Target -> Calculation funnel.

Because Umami event-data properties also consume usage records, the practical quota reduction is larger than the raw event-count reduction.

## Validation

- `node --check js/core/analytics.js` passes.
- `npm run build` passes.
- Desktop and mobile builds use the same analytics wrapper, so no page-specific changes are required.
