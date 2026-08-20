# Analytics

The project uses Umami for lightweight, privacy-conscious usage analytics.

The tracker is loaded by the desktop and mobile page shells. Application code sends custom events through `js/core/analytics.js` instead of calling `window.umami.track()` directly.

## Custom events

The current event set intentionally focuses on meaningful user actions rather than high-frequency UI input:

| Event | When it is sent | Event data |
|---|---|---|
| `calculation` | Artillery/target/map/weapon state changes and settles for 700 ms | `map`, `weapon`, `inRange` |
| `artillery-placed` | Artillery point is placed or dragged on the map | `map` |
| `target-placed` | Target point is placed or dragged on the map | `map` |
| `map-changed` | User changes the map preset or applies a custom map | `map` |
| `weapon-changed` | User selects a different weapon | `weapon` |
| `target-saved` | User saves the current target | `withArtillery` |
| `target-restored` | User restores a saved target | `withArtillery` |
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
- drawing geometry;
- user marker coordinates;
- coordinate-search values;
- any localStorage contents.
- exported/imported JSON contents or file names.


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
