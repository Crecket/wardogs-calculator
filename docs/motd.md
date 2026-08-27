## Message of the Day

Announcements can be published through:

```text
data/motd.json
```

MOTD supports:

- Multiple languages
- Scheduled start time
- Scheduled end time
- Per-message IDs
- "Don't show again"
- Local dismissal persistence

A new announcement can therefore be published without modifying the application logic.

## Localization

Production announcements should include every supported locale id in both `title` and `message`, including:

```text
zh-cn
ko
```

The runtime can fall back to English when a translation is missing, but normal release QA should not rely on that fallback for a supported production language.

---

## Small-screen behavior

MOTD cards are height-limited to the available viewport. When a message is taller than the available space, only the message body scrolls while the title, close button, and **Don't show again** control remain accessible. Mobile sizing also accounts for the app header and safe-area insets.
