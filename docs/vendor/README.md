# Vendored dependencies

## anime.js 4.5.0 — MIT

`anime.umd.min.js`, taken from the published npm tarball, unmodified.

**Why the file is committed rather than fetched.** The app this site advertises
permits zero remote origins in its own window. A site making that claim should
not itself pull code off someone else's CDN on every visit — a CDN can change
what it serves, and a page that loads a third-party script is a page whose
behaviour someone else controls. Committing the file means the bytes served are
the bytes reviewed.

There is no build step. The file is loaded with a plain `<script>` tag and
attaches to `window.anime`.

Licence text is in `anime.LICENSE.md`, as MIT requires.
