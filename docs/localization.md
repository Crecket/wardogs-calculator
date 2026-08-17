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

Translation data is stored under:

```text
locales/
```

The application automatically selects a language based on the user's browser/system locale.

If the user manually selects another language, that preference is stored locally and takes priority on future visits.

### Localized URLs

Search-indexable localized pages are available at:

```text
/
├── ru/
├── uk/
├── de/
├── fr/
├── es/
├── pl/
└── pt/
```

For example:

```text
https://wardogs-artillery.com/ru/
https://wardogs-artillery.com/de/
```

The Cat localization is intentionally excluded from search indexing.

---

---

## Localized Page Sources

Localized HTML entry pages are kept outside the repository root:

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

These files are transformed into the public directory structure during the build process.

For example:

```text
src/pages/locales/ru.html
        ↓
dist/ru/index.html
        ↓
https://wardogs-artillery.com/ru/
```

This keeps the repository root clean without changing any public URLs.

---
