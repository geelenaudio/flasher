const REPO = "geelenaudio/paretoamp";
const BASE = new URL(".", import.meta.url);
const FILTERS = [
  { usbVendorId: 0x1a86 }, // CH340
  { usbVendorId: 0x10c4 }, // CP210x
  { usbVendorId: 0x303a }, // Espressif
  { usbVendorId: 0x0403 }, // FTDI
  { usbVendorId: 0x067b }, // PL2303
];

const SLUGS = {
  amped: { esp32: "amped-esp32", s3: "amped-esp32s3" },
  louder: { esp32: "louder-esp32", s3: "louder-esp32s3" },
};

const $ = (id) => document.getElementById(id);

const els = {
  version: $("version"),
  versionStatus: $("version-status"),
  usbHint: $("usb-hint"),
  identifyStatus: $("identify-status"),
  flashStatus: $("flash-status"),
  downloads: $("downloads"),
  installBtn: $("install-btn"),
  noSerial: $("no-serial"),
  identify: $("btn-identify"),
  identifyAll: $("btn-identify-all"),
};

let releases = [];
let usbHint = { product: null, chip: null, label: "" };
let manifestObjectUrl = null;
let flashGen = 0;

function product() {
  const picked = document.querySelector('input[name="product"]:checked');
  return picked ? picked.value : "amped";
}

function filename(slug, tag) {
  return `pareto-amp-${slug}-${tag}.bin`;
}

function assetFor(rel, slug) {
  const assets = rel.assets || [];
  const exact = filename(slug, rel.tag_name);
  return (
    assets.find((a) => a.name === exact) ||
    assets.find((a) => a.name.startsWith(`pareto-amp-${slug}-`) && a.name.endsWith(".bin")) ||
    null
  );
}

function localFirmwareUrl(rel, slug) {
  const asset = assetFor(rel, slug);
  const name = asset ? asset.name : filename(slug, rel.tag_name);
  return new URL(`firmware/${rel.tag_name}/${name}`, BASE).href;
}

function githubDownloadUrl(rel, slug) {
  const asset = assetFor(rel, slug);
  if (asset && asset.browser_download_url) return asset.browser_download_url;
  const tag = rel.tag_name;
  const name = filename(slug, tag);
  return `https://github.com/${REPO}/releases/download/${tag}/${name}`;
}

function chipFlag(slug) {
  return slug.endsWith("s3") ? "esp32s3" : "esp32";
}

function portExample(slug) {
  return slug.endsWith("s3") ? "/dev/ttyACM0" : "/dev/ttyUSB0";
}

function vendorHint(vid) {
  const id = typeof vid === "number" ? vid : parseInt(vid, 10);
  if (id === 0x1a86) {
    return {
      product: "louder",
      chip: "esp32",
      label: "CH340 UART bridge — likely Louder-ESP32. Override if this is Amped.",
    };
  }
  if (id === 0x10c4) {
    return {
      product: "amped",
      chip: "esp32",
      label: "Silicon Labs CP210x — likely Amped-ESP32. Override if this is Louder.",
    };
  }
  if (id === 0x303a) {
    return {
      product: null,
      chip: "s3",
      label: "Espressif USB (S3). Still pick Amped or Louder — USB cannot tell them apart.",
    };
  }
  if (id === 0x0403) {
    return { product: null, chip: "esp32", label: "FTDI UART adapter. Pick Amped or Louder yourself." };
  }
  if (Number.isFinite(id) && id > 0) {
    const hex = id.toString(16).padStart(4, "0");
    return { product: null, chip: null, label: `USB vendor 0x${hex}. Pick Amped or Louder yourself.` };
  }
  return { product: null, chip: null, label: "" };
}

function setProduct(value) {
  const radio = document.querySelector(`input[name="product"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function renderHint() {
  if (!usbHint.label) {
    els.usbHint.textContent = "";
    return;
  }
  els.usbHint.innerHTML = `USB hint: <strong>${usbHint.label}</strong>`;
}

async function assetExists(url) {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return true;
    if (head.status !== 404 && head.status !== 405) return false;
    if (head.status === 405) {
      const ranged = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
      return ranged.ok || ranged.status === 206;
    }
    return false;
  } catch {
    return false;
  }
}

function currentRelease() {
  const tag = els.version.value;
  return releases.find((r) => r.tag_name === tag) || null;
}

function updateDownloads() {
  const rel = currentRelease();
  const tag = rel ? rel.tag_name : "";
  const slugs = SLUGS[product()];
  els.downloads.innerHTML = "";
  if (!rel || !tag) return;

  for (const [kind, slug] of [
    ["ESP32 (WROVER)", slugs.esp32],
    ["ESP32-S3", slugs.s3],
  ]) {
    const asset = assetFor(rel, slug);
    const file = asset ? asset.name : filename(slug, tag);
    const href = githubDownloadUrl(rel, slug);
    const row = document.createElement("div");
    row.className = "dl-row";
    const highlight = usbHint.chip === "s3" ? kind.includes("S3") : usbHint.chip === "esp32" ? kind.includes("WROVER") : false;
    row.innerHTML = `
      <a class="btn btn-secondary" href="${href}">${file}</a>
      <span>${kind}${highlight ? " · matches USB hint" : ""}</span>
      <pre>esptool --chip ${chipFlag(slug)} --port ${portExample(slug)} write-flash 0x0 ${file}</pre>
    `;
    els.downloads.appendChild(row);
  }
}

async function updateFlash() {
  const gen = ++flashGen;
  const rel = currentRelease();
  const hasSerial = "serial" in navigator;
  els.noSerial.classList.toggle("hidden", hasSerial);
  els.installBtn.classList.add("hidden");
  els.flashStatus.textContent = "";
  els.flashStatus.className = "status";

  if (!hasSerial) {
    els.flashStatus.textContent = "Download a factory image below, or open this page in Chrome, Edge, Opera, or Firefox 151+.";
    return;
  }
  if (!rel) return;

  const tag = rel.tag_name;
  const slugs = SLUGS[product()];
  const esp32Url = localFirmwareUrl(rel, slugs.esp32);
  const s3Url = localFirmwareUrl(rel, slugs.s3);
  const [hasEsp32, hasS3] = await Promise.all([assetExists(esp32Url), assetExists(s3Url)]);
  if (gen !== flashGen) return;

  if (!hasEsp32 && !hasS3) {
    els.flashStatus.className = "status error";
    els.flashStatus.textContent =
      "This version is not on the installer yet (copied hourly). Download still works. Or run the flasher Pages workflow.";
    return;
  }

  const builds = [];
  if (hasEsp32) {
    builds.push({ chipFamily: "ESP32", parts: [{ path: esp32Url, offset: 0 }] });
  }
  if (hasS3) {
    builds.push({ chipFamily: "ESP32-S3", parts: [{ path: s3Url, offset: 0 }] });
  }

  const manifest = {
    name: "Pareto Amp",
    version: tag.replace(/^v/, ""),
    new_install_prompt_erase: true,
    new_install_improv_wait_time: 0,
    builds,
  };
  if (manifestObjectUrl) URL.revokeObjectURL(manifestObjectUrl);
  manifestObjectUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/json" }));
  els.installBtn.manifest = manifestObjectUrl;
  els.installBtn.classList.remove("hidden");
  const missing = [];
  if (!hasEsp32) missing.push("ESP32");
  if (!hasS3) missing.push("ESP32-S3");
  els.flashStatus.className = "status ok";
  els.flashStatus.textContent = missing.length
    ? `Ready. ${missing.join(" and ")} image not mirrored yet; Connect will use the chip that is present.`
    : "Ready. Connect picks ESP32 vs ESP32-S3.";
}

function onSelectionChange() {
  updateDownloads();
  updateFlash();
}

async function loadReleases() {
  els.versionStatus.textContent = "";
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const all = await res.json();
    releases = all.filter((r) => !r.draft && (r.assets || []).some((a) => /^pareto-amp-.*\.bin$/.test(a.name)));
    els.version.innerHTML = "";
    if (!releases.length) {
      els.version.innerHTML = "<option>No factory images</option>";
      els.versionStatus.className = "status error";
      els.versionStatus.textContent = "No public releases with factory .bin files.";
      return;
    }
    for (const r of releases) {
      const opt = document.createElement("option");
      opt.value = r.tag_name;
      opt.textContent = r.prerelease ? `${r.tag_name} (pre)` : r.name ? `${r.tag_name} — ${r.name}` : r.tag_name;
      els.version.appendChild(opt);
    }
    els.version.disabled = false;
    onSelectionChange();
  } catch (err) {
    els.version.innerHTML = "<option>Failed to load</option>";
    els.versionStatus.className = "status error";
    els.versionStatus.textContent = String(err.message || err);
  }
}

async function identify(allPorts) {
  els.identifyStatus.textContent = "";
  if (!("serial" in navigator)) {
    els.identifyStatus.className = "status error";
    els.identifyStatus.textContent = "This browser has no Web Serial.";
    return;
  }
  try {
    const port = await navigator.serial.requestPort(allPorts ? {} : { filters: FILTERS });
    const info = port.getInfo();
    usbHint = vendorHint(info.usbVendorId);
    renderHint();
    if (usbHint.product) setProduct(usbHint.product);
    els.identifyStatus.className = "status ok";
    els.identifyStatus.textContent = "Adapter noted. Connect and flash will ask you to pick the port again.";
    onSelectionChange();
  } catch (err) {
    if (err && err.name === "NotFoundError") {
      els.identifyStatus.textContent = "No port selected.";
      return;
    }
    els.identifyStatus.className = "status error";
    els.identifyStatus.textContent = String(err.message || err);
  }
}

async function hintFromGranted() {
  if (!("serial" in navigator)) return;
  try {
    const ports = await navigator.serial.getPorts();
    if (ports.length !== 1) return;
    usbHint = vendorHint(ports[0].getInfo().usbVendorId);
    if (usbHint.product) setProduct(usbHint.product);
    renderHint();
    onSelectionChange();
  } catch {
    /* ignore */
  }
}

document.querySelectorAll('input[name="product"]').forEach((el) => {
  el.addEventListener("change", onSelectionChange);
});
els.version.addEventListener("change", onSelectionChange);
els.identify.addEventListener("click", () => identify(false));
els.identifyAll.addEventListener("click", () => identify(true));

if (!("serial" in navigator)) {
  $("identify-actions").classList.add("hidden");
}

hintFromGranted();
loadReleases();
