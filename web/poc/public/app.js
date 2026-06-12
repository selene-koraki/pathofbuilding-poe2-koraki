// Path of Building 2 — web client (PoC)
// Talks to the local Lua engine service and renders its computed sidebar,
// translating PoB's ^-colour escapes into the in-game palette.

// PoB's ^0-^9 escape palette (close to the desktop renderer's values).
const PALETTE = {
	"0": "#000000", "1": "#e63c3c", "2": "#46c246", "3": "#4757e6", "4": "#e6e600",
	"5": "#b44bff", "6": "#3cd2d2", "7": "#e8e2d4", "8": "#9a9384", "9": "#5f5848",
};

function escapeHtml(s) {
	return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Convert an engine string with ^x RRGGBB / ^N colour codes into HTML spans.
function colorize(text) {
	if (text == null) return "";
	let out = "", color = null, i = 0;
	while (i < text.length) {
		if (text[i] === "^") {
			const n = text[i + 1];
			if (n === "x" || n === "X") { color = "#" + text.substr(i + 2, 6); i += 8; }
			else if (n >= "0" && n <= "9") { color = PALETTE[n]; i += 2; }
			else { i += 1; }
		} else {
			let next = text.indexOf("^", i);
			if (next < 0) next = text.length;
			const chunk = escapeHtml(text.slice(i, next));
			out += color ? `<span style="color:${color}">${chunk}</span>` : chunk;
			i = next;
		}
	}
	return out;
}

const $ = sel => document.querySelector(sel);
const setStatus = msg => { $("#status").textContent = msg; };

async function loadBuildList() {
	const res = await fetch("/api/builds");
	const { builds } = await res.json();
	const ul = $("#buildList");
	ul.innerHTML = "";
	if (!builds.length) { ul.innerHTML = '<li class="muted">No builds found.</li>'; return; }
	for (const name of builds) {
		const li = document.createElement("li");
		const btn = document.createElement("button");
		btn.textContent = name;
		btn.onclick = () => selectBuild(name, btn);
		li.appendChild(btn);
		ul.appendChild(li);
	}
	// auto-open the first build
	ul.querySelector("button").click();
}

async function selectBuild(name, btn) {
	document.querySelectorAll(".build-list button").forEach(b => b.classList.remove("active"));
	if (btn) btn.classList.add("active");
	setStatus(`Computing "${name}"…`);
	const t0 = performance.now();
	const res = await fetch("/api/build?name=" + encodeURIComponent(name));
	const data = await res.json();
	renderBuild(data);
	setStatus(`Computed "${name}" in ${Math.round(performance.now() - t0)} ms.`);
}

function renderBuild(data) {
	const m = data.meta || {};
	$("#charClass").innerHTML = colorize(`${m.class || "—"}${m.ascendancy && m.ascendancy !== "None" ? " · " + m.ascendancy : ""}`);
	$("#charSub").textContent =
		`Level ${m.level ?? "—"}${m.mainSkill ? "  ·  " + m.mainSkill : ""}`;

	const box = $("#stats");
	box.innerHTML = "";
	for (const s of data.stats) {
		if (s.spacer) {
			const d = document.createElement("div"); d.className = "stat-gap"; box.appendChild(d);
		} else if (s.header) {
			const d = document.createElement("div"); d.className = "stat-head";
			d.innerHTML = colorize(s.header); box.appendChild(d);
		} else {
			const row = document.createElement("div"); row.className = "stat-row";
			row.innerHTML = `<span class="label">${colorize(s.label)}</span>` +
			                `<span class="value">${colorize(s.value)}</span>`;
			box.appendChild(row);
		}
	}
}

loadBuildList().catch(e => setStatus("Error: " + e.message));
