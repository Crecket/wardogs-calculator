## Localization

The application currently supports:

- English
- Russian
- Ukrainian
- German
- French
- Spanish
- Polish
- Portuguese
- Cat 🐈

Translation data is stored once under:

```text
locales/
```

The **same locale JSON files are used by both desktop and mobile interfaces**. Mobile translations are not duplicated.

The application automatically selects a language based on the user's browser/system locale. If the user manually selects another language, that preference is stored under the shared `wardogs-language` localStorage key and takes priority on future visits.

Because desktop and mobile are served from the same origin, a language selected in one interface is immediately available to the other.

## Localized URLs

Desktop pages:

```text
/
├── ru/
├── uk/
├── de/
├── fr/
├── es/
├── pl/
├── pt/
└── cat/
```

Mobile pages:

```text
/mobile/
├── ru/
├── uk/
├── de/
├── fr/
├── es/
├── pl/
├── pt/
└── cat/
```

For example:

```text
https://wardogs-artillery.com/ru/
https://wardogs-artillery.com/mobile/ru/
```

Changing language from the mobile UI keeps the user inside `/mobile/`. Changing language from the desktop UI keeps the user on the desktop routes.

Automatic device routing also preserves explicit language routes:

```text
/de/ -> /mobile/de/
```

The root entry (`/` or `/mobile/`) may still use the browser/system locale automatically when there is no saved manual preference.

Desktop localized pages are search-indexable. Mobile pages are intentionally `noindex` and canonicalize to the matching desktop language URL. The Cat localization remains excluded from normal search indexing.

---

## Localized Page Sources

Desktop localized HTML entry pages are kept under:

```text
src/
└── pages/
    ├── index.html
    └── locales/
        ├── ru.html
        ├── uk.html
        ├── de.html
        ├── fr.html
        ├── es.html
        ├── pl.html
        ├── pt.html
        └── cat.html
```

The mobile interface uses one HTML template:

```text
src/pages/mobile/index.html
```

The build script generates the language-specific mobile routes automatically from `locales/index.json`:

```text
src/pages/mobile/index.html
        ↓
dist/mobile/index.html
dist/mobile/ru/index.html
dist/mobile/de/index.html
...
```

All generated mobile pages reference the shared root-level assets, JavaScript, locales, map configuration, and map tiles instead of creating duplicate copies.


## Map Tools localization

Map Tools use the shared locale JSON just like the rest of the application. Current localized tool labels include **Pencil**, **Eraser**, **Markers**, **Coordinate search**, and **Layers**, plus the cursor-coordinate layer toggle. Any new Map Tool UI string should be added to every file under `locales/` so desktop and mobile stay in sync.
