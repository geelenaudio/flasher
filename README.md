# Pareto Amp installer

Browser page that flashes [geelenaudio/paretoamp](https://github.com/geelenaudio/paretoamp)
factory images over USB. Live site:
[https://geelenaudio.github.io/flasher/](https://geelenaudio.github.io/flasher/).

Chrome, Edge, Opera, and Firefox 151+ can flash in the page (Web Serial).
Safari cannot; it gets a download plus an `esptool` command.

## How it works

The version dropdown calls the public GitHub Releases API. ESP Web Tools
must `fetch()` the `.bin`, and GitHub’s download CDN has no CORS headers, so
CI copies those public factory files onto this Pages site under `firmware/<tag>/`.

Paretoamp dispatches this Pages workflow after it attaches factory images
to a release. An hourly run copies anything that dispatch missed. You can
also run **Actions → Pages → Run workflow**.

## Local preview

Web Serial allows `http://localhost`. Factory copies are absent until you
mirror a release (Flash will say so; Download still hits GitHub).

```sh
python3 -m http.server 8080
```

Open http://localhost:8080/

## GitHub Pages

Repo **Settings → Pages → Source: GitHub Actions** (already set). First
deploy URL: `https://geelenaudio.github.io/flasher/`. If the `github-pages`
environment waits on a reviewer, allow `main`.

## Squarespace

Link **Install firmware** to `https://geelenaudio.github.io/flasher/` in a
new tab. Do not paste `esp-web-install-button` with GitHub download URLs
into a Code Block.

## Styling

Colours and type match [geelen.audio](https://geelen.audio) (Inter, Space
Grotesk, cream / forest / rust). Squarespace CSS is not imported.

## Licence

Installer code in this repo is for Geelen Audio. Vendored
[ESP Web Tools](https://github.com/esphome/esp-web-tools) is Apache-2.0
(`vendor/esp-web-tools/LICENSE`). Firmware binaries remain GPL-3.0-or-later
as released from paretoamp.
