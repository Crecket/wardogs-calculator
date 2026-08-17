## Project Structure

```text
wardogs-calculator/
├── .github/
│   └── workflows/
│       └── pages.yml
│
├── assets/
│   ├── flags/
│   ├── favicon.png
│   └── preview.png
│
├── config/
├── data/
├── js/
│   ├── core/
│   ├── features/
│   ├── map/
│   └── ui/
│
├── locales/
├── maps/
│   └── tiles/
│
├── scripts/
│   └── build-pages.mjs
│
├── src/
│   └── pages/
│       ├── index.html
│       └── locales/
│
├── package.json
├── style.css
├── robots.txt
├── sitemap.xml
├── CNAME
├── LICENSE
└── README.md
```

`dist/` is generated during the build process and is not committed to the repository.

---

---

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript
- HTML Canvas API
- Fetch API
- JSON
- Browser `localStorage`
- Node.js build script
- GitHub Actions
- GitHub Pages

The application itself intentionally uses **no frontend framework**.

Node.js is only used for the build/deployment process.

---

---

## Running Locally

The project should be served over HTTP because maps, configuration files, localization files, and other resources are loaded using `fetch()`.

### Requirements

Install a recent version of Node.js.

Python can optionally be used to run a simple local HTTP server.

### 1. Build the site

From the project root:

```bash
npm run build
```

This generates:

```text
dist/
```

with the same directory structure that is deployed to production.

### 2. Start a local server

Using Python:

```bash
cd dist
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Localized pages can be tested using the same URL structure as production:

```text
http://localhost:8000/ru/
http://localhost:8000/uk/
http://localhost:8000/de/
```

### Development Workflow

When modifying the project:

```text
Edit source
    ↓
npm run build
    ↓
Refresh browser
```

You can keep the HTTP server running while rebuilding the project from another terminal.

---

---

## Deployment

Production is available at:

**https://wardogs-artillery.com/**

Deployment is handled automatically by GitHub Actions.

The workflow is located at:

```text
.github/workflows/pages.yml
```

On a push to `main`, GitHub Actions:

1. Checks out the repository
2. Sets up Node.js
3. Runs:

```bash
npm run build
```

4. Generates the production site in:

```text
dist/
```

5. Uploads the generated site as a GitHub Pages artifact
6. Deploys it to GitHub Pages

GitHub Pages should therefore be configured to use:

```text
Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

Do not manually edit files inside `dist/`, as they will be regenerated during the next build.

---
