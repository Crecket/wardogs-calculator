# Analytics

The project uses Umami for lightweight, privacy-conscious usage analytics.

The tracker is loaded by the desktop and mobile page shells. Application code sends custom events through `js/core/analytics.js` instead of calling `window.umami.track()` directly.

## Custom events

The current event set intentionally focuses on meaningful user actions rather than high-frequency UI input:

| Event | When it is sent | Event data |
|---|---|---|
| `calculation` | Artillery/target/map/weapon state changes and settles for 700 ms | `map`, `weapon`, `inRange` |
| `origin-placed` | Artillery/origin point is placed or dragged on the map | `map` |
| `target-placed` | Target point is placed or dragged on the map | `map` |
| `map-changed` | User changes the map preset or applies a custom map | `map` |
| `weapon-changed` | User selects a different weapon | `weapon` |
| `target-saved` | User saves the current target | `withArtillery` |
| `target-restored` | User restores a saved target | `withArtillery` |
| `target-exported` | User exports one saved target | `withArtillery` |
| `targets-exported` | User exports the complete saved-target list | `count` |
| `targets-imported` | A valid single-target or target-list JSON file is imported | `count`, `format` |
| `preset-marker-selected` | A preset map marker is selected as the target | `map` |
| `coordinate-search` | A valid coordinate search is completed | `map` |
| `ruler-used` | A non-zero ruler measurement is completed | `map` |
| `drawing-created` | A pencil path is completed | `map` |
| `user-marker-placed` | A user Map Tools marker is placed | `map` |
| `map-changes-exported` | User exports persistent Map Tools data | `drawings`, `markers` |
| `map-changes-imported` | A valid Map Tools JSON file is imported | `drawings`, `markers`, `layers` |
| `partner-click` | User opens a community partner link | `partner`, `placement` |
| `desktop-version` | Mobile user chooses the desktop interface | none |

## Calculation event behavior

`calculation` is debounced. Dragging a target or artillery marker therefore does not emit an event on every pointer move.

The initial solution rendered on application startup is treated as a baseline and is not counted as a user calculation. An event is sent only after the calculation state changes and remains stable for 700 ms.

## Privacy and event volume

Custom analytics data does **not** include:

- exact artillery or target coordinates;
- saved target names;
- saved-target JSON contents or file names;
- drawing geometry;
- user marker coordinates;
- coordinate-search values;
- any localStorage contents.
- exported/imported JSON contents or file names.


Saved-target transfer events report only counts, import format (`single` or `list`), and whether a single exported target includes an artillery position. Names and coordinates are never sent.

Map data transfer events contain only aggregate item counts and whether layer settings were included. Coordinates, drawing geometry, marker positions, and imported file contents are not sent to Umami.

This keeps event payloads small and avoids generating excessive event-data usage. High-frequency actions such as map panning, cursor movement, mouse movement, and pinch/wheel zoom are deliberately not tracked.

## Adding an event

Use the shared wrapper:

```js
trackAnalytics(
    'event-name',
    {
        property: 'value'
    }
);
```

Do not call `window.umami.track()` directly from feature modules.

Prefer events that represent a completed user action. Avoid events inside animation frames, pointer-move handlers, render loops, or other high-frequency paths.

If Umami has not finished loading yet, the wrapper temporarily queues a small number of events and flushes them when the tracker becomes available. If the tracker is blocked or unavailable, application functionality is unaffected.

## Development analytics switch

`npm run dev` disables production Umami analytics by default. This prevents local pageviews and custom events from contaminating production usage data.

The development server reads `WARDOGS_DISABLE_ANALYTICS`:

```bash
WARDOGS_DISABLE_ANALYTICS=true npm run dev
```

To deliberately test analytics locally:

```bash
WARDOGS_DISABLE_ANALYTICS=false npm run dev
```

PowerShell equivalent:

```powershell
$env:WARDOGS_DISABLE_ANALYTICS = "false"
npm run dev
```

When disabled, the dev server removes the Umami script from served HTML and sets `window.__WARDOGS_ANALYTICS_DISABLED__ = true`. The shared analytics wrapper checks this flag before sending or queueing events. Production builds do not inject this flag and are not affected by the development setting.

