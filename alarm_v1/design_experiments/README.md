# design_experiments — DISPOSABLE

Alternative front-ends for the same API, so design decisions can be compared
side by side with the original.

**Nothing here is required by the application.** Delete or archive this whole
folder and the app is unaffected: `app/server.py` only mounts what exists, and
no data, config, pipeline code or documentation lives in here.

| Variant | URL | Author |
|---|---|---|
| original | http://localhost:8700/ | Claude |
| `codex_v1` | http://localhost:8700/design/codex_v1/ | Codex (gpt-5.6-sol) |

`codex_v1/web/` started as a byte-for-byte copy of `app/web/`.
`codex_v1/ORIGINAL_CHECKSUMS.txt` records the originals so any drift is provable.

Rules that applied to the Codex run:
- it could modify **only** files under `design_experiments/codex_v1/web/`
- presentation only — no API calls added or removed, no numbers recomputed
  client-side, no new network requests, no dependencies
- the original `app/web/` was off limits, as was everything else in the project
