(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Configuration – one entry per section of the workbook
   * ------------------------------------------------------------------ */
  const col = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });

  const VIEWS = {
    updates: {
      label: "Daily Updates", endpoint: "/api/updates/", add: "Add drawing", noun: "drawing",
      placeholder: "Search drawing, customer, item, note…",
      filters: [
        { param: "status", label: "Status", opt: "status" },
        { param: "drawn_by", label: "Drawn by", opt: "drawn_by" },
        { param: "software", label: "Software", opt: "software" },
        { param: "sales_person", label: "Sales person", opt: "sales_person" },
        { param: "period", label: "Month", opt: "period" },
      ],
      title: (r) => (r.dwg_no ? `DWG ${r.dwg_no}` : "Record"),
      subtitle: (r) => [r.item, r.customer && r.customer !== "-" ? r.customer : ""].filter(Boolean).join(" · "),
      columns: [
        // col("sno", "S.No", "int", { group: "Drawing", cls: "num", fo: 2 }),
        col("date", "Date", "date", { group: "Drawing", show: 1, mobile: 1, cls: "date", fo: 1 }),
        col("dwg_no", "DWG No", "text", { group: "Drawing", show: 1, mobile: 1, cls: "dwg", fo: 3 }),
        col("drawn_by", "Drawn By", "select", { group: "Drawing", opt: "drawn_by", show: 1, fo: 4 }),
        col("software", "Software Name", "select", { group: "Drawing", opt: "software", show: 1, fo: 5 }),
        col("item", "Item", "text", { group: "Drawing", show: 1, mobile: 1, cls: "item wide", full: 1, fo: 7 }),
        col("model_no", "Model No", "text", { group: "Drawing", cls: "wide", fo: 6 }),
        col("customer", "Customer Name", "combo", { group: "Customer & order", opt: "customer", show: 1, mobile: 1, cls: "wide", full: 1, fo: 1 }),
        col("project_po", "Project Name / PO Number", "text", { group: "Customer & order", full: 1, fo: 4 }),
        col("sq_number", "SQ Number / Project", "text", { group: "Customer & order", fo: 3 }),
        col("sales_person", "Sales Person Name", "combo", { group: "Customer & order", opt: "sales_person", show: 1, mobile: 1, fo: 2 }),
        col("note", "Note", "area", { group: "Files & notes", cls: "wide", full: 1 }),
        col("status", "Status", "select", { group: "Status & approval", opt: "status", show: 1, mobile: 1, badge: 1 }),
        col("approved_by", "DWG Approved By", "select", { group: "Status & approval", opt: "approved_by" }),
        col("submitted_date", "Submitted Date", "date", { group: "Status & approval", cls: "date" }),
        col("issued_for", "DWG Issued For", "select", { group: "Status & approval", opt: "issued_for" }),
        col("dwg_status", "DWG Status", "select", { group: "Status & approval", opt: "dwg_status" }),
        col("factory_dwg_status", "Factory DWG Status", "text", { group: "Status & approval" }),
        col("file_path", "File Path", "path", { group: "Files & notes", full: 1 }),
        col("price", "Price", "text", { group: "Customer & order", cls: "num", fo: 5 }),
        col("remarks", "Remarks", "area", { group: "Files & notes", cls: "wide", full: 1 }),
      ],
    },
  };

  /* ------------------------------------------------------------------ *
   *  Helpers
   * ------------------------------------------------------------------ */
  const $ = (s, r = document) => r.querySelector(s);
  const csrf = $('meta[name="csrf"]').content;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function h(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  }
  const icon = (d) => h("span", { html: `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>` }).firstChild;
  const ICONS = {
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  };

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf, ...(opts.headers || {}) },
    });
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch (_) { /* no body */ }
      throw Object.assign(new Error(data.error || "Something went wrong. Please try again."), { errors: data.errors || {} });
    }
    return res.status === 204 ? null : res.json();
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
  }

  function statusTone(s) {
    const v = (s || "").toLowerCase();
    if (v.startsWith("done")) return "ok";
    if (v.startsWith("pending") || v.startsWith("ongoing")) return "warn";
    if (v.startsWith("cancel")) return "bad";
    if (v.startsWith("rev")) return "info";
    return "neutral";
  }

  function copyText(text) {
    const done = () => toast("Path copied");
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => toast("Could not copy", true));
      return;
    }
    const ta = h("textarea", { style: "position:fixed;opacity:0" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try { document.execCommand("copy") ? done() : toast("Could not copy", true); } catch (_) { toast("Could not copy", true); }
    ta.remove();
  }

  function toast(msg, isError = false) {
    const t = h("div", { class: "toast" + (isError ? " error" : ""), role: "status" }, msg);
    $("#toasts").append(t);
    setTimeout(() => t.remove(), 3200);
  }

  /* ------------------------------------------------------------------ *
   *  State
   * ------------------------------------------------------------------ */
  const state = {
    view: "updates", page: 1, size: Number(localStorage.getItem("dd.size")) || 50,
    q: "", sort: "", filters: {}, data: null, opts: {}, summary: null, editing: null, token: 0,
  };
  const V = () => VIEWS[state.view];

  function visibleKeys(view) {
    try {
      const saved = JSON.parse(localStorage.getItem("dd.cols." + view));
      if (Array.isArray(saved)) return new Set(saved);
    } catch (_) { /* ignore */ }
    return new Set(VIEWS[view].columns.filter((c) => c.show).map((c) => c.key));
  }
  function saveVisible(set) { localStorage.setItem("dd.cols." + state.view, JSON.stringify([...set])); }

  /* ------------------------------------------------------------------ *
   *  Data loading
   * ------------------------------------------------------------------ */
  function query() {
    const p = new URLSearchParams({ page: state.page, page_size: state.size });
    if (state.q) p.set("q", state.q);
    if (state.sort) p.set("sort", state.sort);
    for (const [k, v] of Object.entries(state.filters)) if (v) p.set(k, v);
    return p;
  }

  async function load() {
    const token = ++state.token;
    $("#loading").classList.add("on");
    try {
      const data = await api(V().endpoint + "?" + query());
      if (token !== state.token) return;
      state.data = data;
      state.page = data.page;
      renderTable();
      renderPager();
      if (state.view === "updates") {
        const p = query(); p.delete("page"); p.delete("page_size"); p.delete("sort");
        $("#exportBtn").href = "/api/updates/export/?" + p;
      }
    } catch (e) {
      toast(e.message, true);
    } finally {
      if (token === state.token) $("#loading").classList.remove("on");
    }
  }

  async function loadMeta() {
    try {
      const [opts, summary] = await Promise.all([api("/api/options/"), api("/api/summary/")]);
      state.opts = opts;
      state.summary = summary;
      renderTabs();
      renderStats();
      renderFilters();
      renderDatalists();
    } catch (e) { toast(e.message, true); }
  }

  /* ------------------------------------------------------------------ *
   *  Rendering – chrome
   * ------------------------------------------------------------------ */
  function renderTabs() {
    const counts = state.summary ? { updates: state.summary.total, factory: state.summary.factory, projects: state.summary.projects } : {};
    const tabs = $("#tabs");
    tabs.replaceChildren(...Object.entries(VIEWS).map(([key, v]) =>
      h("button", {
        class: "tab", role: "tab", type: "button", "aria-selected": String(key === state.view),
        onclick: () => switchView(key),
      }, v.label, counts[key] != null ? h("span", { class: "count" }, String(counts[key])) : null)));
  }

  function renderStats() {
    const box = $("#stats");
    box.hidden = state.view !== "updates" || !state.summary;
    if (box.hidden) return;
    const s = state.summary;
    const cancelled = (state.opts.status || []).find((x) => x.toLowerCase().startsWith("cancel")) || "Canceld";
    const cards = [
      { label: "Total drawings", value: s.total, apply: null },
      { label: "This month", value: s.this_month, apply: { period: s.this_month_key } },
      { label: "Pending", value: s.pending, apply: { status: "Pending" } },
      { label: "Cancelled", value: s.cancelled, apply: { status: cancelled } },
    ];
    box.replaceChildren(...cards.map((c) => {
      const active = c.apply && Object.entries(c.apply).every(([k, v]) => state.filters[k] === v)
        && Object.values(state.filters).filter(Boolean).length === 1;
      return h(c.apply ? "button" : "div", {
        class: "stat" + (active ? " active" : ""), type: c.apply ? "button" : null,
        onclick: c.apply ? () => { state.filters = active ? {} : { ...c.apply }; state.page = 1; syncFilterUI(); load(); renderStats(); } : null,
      }, h("span", {}, c.label), h("strong", {}, String(c.value)));
    }));
  }

  function renderFilters() {
    const box = $("#filters");
    box.replaceChildren(...V().filters.map((f) => {
      const list = state.opts[f.opt] || [];
      const sel = h("select", {
        "aria-label": f.label, class: state.filters[f.param] ? "on" : "",
        onchange: (e) => { state.filters[f.param] = e.target.value; state.page = 1; syncFilterUI(); load(); renderStats(); },
      }, h("option", { value: "" }, f.label + ": all"),
        list.map((o) => {
          const value = typeof o === "string" ? o : o.value;
          const label = typeof o === "string" ? o : o.label;
          return h("option", { value, selected: state.filters[f.param] === value }, label);
        }));
      sel.dataset.param = f.param;
      return sel;
    }));
    syncFilterUI();
  }

  function syncFilterUI() {
    document.querySelectorAll("#filters select").forEach((s) => {
      s.value = state.filters[s.dataset.param] || "";
      s.classList.toggle("on", !!s.value);
    });
    $("#clearBtn").hidden = !(state.q || Object.values(state.filters).some(Boolean));
  }

  function renderDatalists() {
    document.querySelectorAll("datalist.dyn").forEach((d) => d.remove());
    for (const key of ["customer", "sales_person"]) {
      document.body.append(h("datalist", { id: "dl-" + key, class: "dyn" },
        (state.opts[key] || []).map((v) => h("option", { value: v }))));
    }
  }

  function renderColsMenu() {
    const vis = visibleKeys(state.view);
    const menu = $("#colsMenu");
    const apply = (set) => { saveVisible(set); renderColsMenu(); renderTable(); };
    menu.replaceChildren(
      h("div", { class: "menu-actions" },
        h("button", { type: "button", onclick: () => apply(new Set(V().columns.map((c) => c.key))) }, "Show all"),
        h("button", { type: "button", onclick: () => { localStorage.removeItem("dd.cols." + state.view); renderColsMenu(); renderTable(); } }, "Reset")),
      ...V().columns.map((c) => h("label", {},
        h("input", {
          type: "checkbox", checked: vis.has(c.key),
          onchange: (e) => { const s = visibleKeys(state.view); e.target.checked ? s.add(c.key) : s.delete(c.key); apply(s); },
        }), c.label)));
    $("#colsBtn").textContent = `Columns (${vis.size}/${V().columns.length})`;
  }

  /* ------------------------------------------------------------------ *
   *  Rendering – table
   * ------------------------------------------------------------------ */
  function renderCell(c, r) {
    const td = h("td", { class: [c.cls || "", c.mobile ? "" : "m-hide"].join(" ").trim(), "data-label": c.label });
    const v = r[c.key];
    if (c.type === "date") {
      if (v) td.textContent = fmtDate(v);
      else if (c.key === "date" && r.date_text) { td.textContent = r.date_text; td.classList.add("dim"); td.title = "Date as written in the original sheet"; }
      return td;
    }
    if (v === "" || v == null) return td;
    if (v === "-") { td.append(h("span", { class: "dim" }, "–")); return td; }
    if (c.badge) { td.append(h("span", { class: "badge " + statusTone(v) }, v)); return td; }
    if (c.type === "path") {
      td.append(h("span", { class: "path", title: v },
        h("span", { class: "mono" }, v),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Copy path", onclick: (e) => { e.stopPropagation(); copyText(v); } }, icon(ICONS.copy))));
      return td;
    }
    td.textContent = v;
    td.title = v;
    return td;
  }

  function renderTable() {
    const grid = $("#grid");
    const rows = state.data ? state.data.results : [];
    const vis = visibleKeys(state.view);
    const cols = V().columns.filter((c) => vis.has(c.key));

    const head = h("tr", {}, cols.map((c) => {
      const sorted = state.sort.replace("-", "") === c.key;
      const th = h("th", { scope: "col", "aria-sort": sorted ? (state.sort.startsWith("-") ? "descending" : "ascending") : null },
        h("button", { type: "button", onclick: () => cycleSort(c.key) }, c.label,
          h("span", { class: "arrow", "aria-hidden": "true" }, sorted && state.sort.startsWith("-") ? "▼" : "▲")));
      return th;
    }), h("th", { class: "act", "aria-label": "Actions" }));

    const body = rows.map((r) => {
      const tr = h("tr", { tabindex: "0", onclick: () => openEditor(r), onkeydown: (e) => { if (e.key === "Enter" && e.target === tr) openEditor(r); } },
        cols.map((c) => renderCell(c, r)),
        h("td", { class: "act" },
          h("button", { class: "icon-btn", type: "button", "aria-label": "Edit", onclick: (e) => { e.stopPropagation(); openEditor(r); } }, icon(ICONS.edit)),
          h("button", { class: "icon-btn del", type: "button", "aria-label": "Delete", onclick: (e) => { e.stopPropagation(); askDelete(r); } }, icon(ICONS.trash))));
      return tr;
    });

    grid.replaceChildren(h("thead", {}, head), h("tbody", {}, body));
    $("#empty").hidden = rows.length > 0;
    grid.hidden = rows.length === 0;
  }

  function cycleSort(key) {
    state.sort = state.sort === key ? "-" + key : state.sort === "-" + key ? "" : key;
    state.page = 1;
    load();
  }

  function renderPager() {
    const d = state.data;
    const pager = $("#pager");
    if (!d || d.count === 0) { pager.replaceChildren(); return; }
    const from = (d.page - 1) * d.page_size + 1;
    const to = Math.min(d.page * d.page_size, d.count);
    pager.replaceChildren(
      h("span", {}, `Showing ${from}–${to} of ${d.count}`),
      h("div", { class: "controls" },
        h("label", {}, "Rows ",
          h("select", { onchange: (e) => { state.size = Number(e.target.value); localStorage.setItem("dd.size", state.size); state.page = 1; load(); } },
            [25, 50, 100, 200].map((n) => h("option", { value: n, selected: n === state.size }, n)))),
        h("button", { class: "btn", type: "button", disabled: d.page <= 1, onclick: () => { state.page--; load(); scrollTop(); } }, "Previous"),
        h("span", {}, `Page ${d.page} of ${d.pages}`),
        h("button", { class: "btn", type: "button", disabled: d.page >= d.pages, onclick: () => { state.page++; load(); scrollTop(); } }, "Next")));
  }
  const scrollTop = () => { $(".table-scroll").scrollTop = 0; };

  /* ------------------------------------------------------------------ *
   *  Drawer (add / edit)
   * ------------------------------------------------------------------ */
  function fieldFor(c, value, stretch) {
    const id = "f-" + c.key;
    let input;
    if (c.type === "select") {
      const list = [...(state.opts[c.opt] || [])];
      if (value && !list.includes(value)) list.push(value);
      input = h("select", { id, name: c.key }, h("option", { value: "" }, "—"), list.map((o) => h("option", { value: o, selected: o === value }, o)));
    } else if (c.type === "area" || c.type === "path") {
      input = h("textarea", { id, name: c.key, rows: c.type === "path" ? 2 : 3, class: c.type === "path" ? "mono" : "" });
      input.value = value || "";
    } else {
      input = h("input", {
        id, name: c.key, autocomplete: "off",
        type: c.type === "date" ? "date" : c.type === "int" ? "number" : "text",
        min: c.type === "int" ? 0 : null, list: c.type === "combo" ? "dl-" + c.opt : null,
      });
      input.value = value ?? "";
    }
    return h("div", { class: "field" + (stretch ? " full" : ""), "data-key": c.key },
      h("label", { for: id }, c.label), input, h("span", { class: "err", hidden: true }));
  }

  function buildForm(record) {
    const groups = [];
    for (const c of V().columns) {
      let g = groups.find((x) => x.name === c.group);
      if (!g) groups.push((g = { name: c.group, cols: [] }));
      g.cols.push(c);
    }
    const order = ["Drawing", "Customer & order", "Status & approval", "Files & notes", "Details"];
    groups.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    for (const g of groups) {
      g.cols.sort((a, b) => (a.fo ?? 50) - (b.fo ?? 50));
      // Pair short fields two per row; a lone short field takes the full row.
      let open = null;
      for (const c of g.cols) {
        const wide = c.full || c.type === "area" || c.type === "path";
        if (wide) { if (open) { open.stretch = true; open = null; } c.stretch = true; }
        else if (open) open = null;
        else { open = c; c.stretch = false; }
      }
      if (open) open.stretch = true;
    }
    const body = $("#formBody");
    body.replaceChildren(
      h("div", { class: "form-error", id: "formError", hidden: true }),
      ...groups.map((g) => h("section", { class: "group" }, h("h3", {}, g.name),
        h("div", { class: "fields" }, g.cols.map((c) => fieldFor(c, record[c.key], c.stretch))))));
    if (state.view === "updates" && record.date_text) {
      const f = fieldFor(col("date_text", "Date (as written in sheet)", "text"), record.date_text, true);
      $('[data-key="date"]', body).after(f);
    }
  }

  let lastFocus = null;
  function showDrawer(open) {
    const dr = $("#drawer");
    dr.classList.toggle("open", open);
    dr.setAttribute("aria-hidden", String(!open));
    dr.inert = !open;
    $("#scrim").hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
    if (!open && lastFocus) lastFocus.focus?.();
  }

  async function openEditor(record) {
    lastFocus = document.activeElement;
    const isNew = !record || !record.id;
    state.editing = isNew ? null : record;
    let base = record || {};
    if (isNew && state.view === "updates") {
      try { base = await api("/api/updates/defaults/"); } catch (_) { base = {}; }
    }
    $("#drawerTitle").textContent = isNew ? V().add : V().title(record);
    $("#drawerSub").textContent = isNew ? "Fill in what you know — you can edit it later." : V().subtitle(record);
    $("#deleteBtn").hidden = isNew;
    buildForm(base);
    showDrawer(true);
    setTimeout(() => $("#formBody input:not([type=hidden]), #formBody select")?.focus(), 230);
  }

  function readForm() {
    const out = {};
    $("#form").querySelectorAll("[name]").forEach((el) => { out[el.name] = el.value; });
    return out;
  }

  async function save(e) {
    e.preventDefault();
    const payload = readForm();
    const btn = $("#saveBtn");
    btn.disabled = true;
    document.querySelectorAll(".field.invalid").forEach((f) => { f.classList.remove("invalid"); $(".err", f).hidden = true; });
    $("#formError").hidden = true;
    try {
      const editing = state.editing;
      await api(editing ? `${V().endpoint}${editing.id}/` : V().endpoint, { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      showDrawer(false);
      toast(editing ? "Changes saved" : "Record added");
      if (!editing) { state.sort = ""; state.page = 1; }
      await Promise.all([load(), loadMeta()]);
    } catch (err) {
      for (const [k, msg] of Object.entries(err.errors || {})) {
        const f = $(`.field[data-key="${k}"]`);
        if (f) { f.classList.add("invalid"); const s = $(".err", f); s.textContent = msg; s.hidden = false; }
      }
      const g = (err.errors || {}).__all__ || err.message;
      const box = $("#formError");
      box.textContent = g; box.hidden = false;
      box.scrollIntoView({ block: "nearest" });
    } finally {
      btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Delete
   * ------------------------------------------------------------------ */
  let pendingDelete = null;
  function askDelete(r) {
    pendingDelete = r;
    lastFocus = document.activeElement;
    const sub = V().subtitle(r);
    $("#confirmTitle").textContent = `Delete ${V().title(r)}?`;
    $("#confirmText").textContent = (sub ? sub + ". " : "") + "This permanently removes the record and cannot be undone.";
    $("#confirm").hidden = false;
    $("#confirmNo").focus();
  }
  function closeConfirm() { $("#confirm").hidden = true; pendingDelete = null; }

  async function doDelete() {
    const r = pendingDelete;
    if (!r) return;
    $("#confirmYes").disabled = true;
    try {
      await api(`${V().endpoint}${r.id}/`, { method: "DELETE" });
      closeConfirm();
      showDrawer(false);
      toast("Record deleted");
      await Promise.all([load(), loadMeta()]);
    } catch (e) {
      toast(e.message, true);
    } finally {
      $("#confirmYes").disabled = false;
    }
  }

  /* ------------------------------------------------------------------ *
   *  View switching & wiring
   * ------------------------------------------------------------------ */
  function switchView(key, push = true) {
    if (!VIEWS[key]) key = "updates";
    state.view = key; state.page = 1; state.q = ""; state.sort = ""; state.filters = {}; state.data = null;
    $("#search").value = "";
    $("#search").placeholder = V().placeholder;
    $("#addBtn").textContent = "+ " + V().add;
    $("#exportBtn").hidden = key !== "updates";
    if (push) history.replaceState(null, "", key === "updates" ? location.pathname : "#" + key);
    renderTabs(); renderStats(); renderFilters(); renderColsMenu();
    $("#grid").replaceChildren();
    load();
  }

  function init() {
    $("#addBtn").addEventListener("click", () => openEditor(null));
    $("#form").addEventListener("submit", save);
    $("#closeDrawer").addEventListener("click", () => showDrawer(false));
    $("#cancelBtn").addEventListener("click", () => showDrawer(false));
    $("#scrim").addEventListener("click", () => showDrawer(false));
    $("#deleteBtn").addEventListener("click", () => state.editing && askDelete(state.editing));
    $("#confirmNo").addEventListener("click", closeConfirm);
    $("#confirmYes").addEventListener("click", doDelete);
    $("#confirm").addEventListener("click", (e) => { if (e.target.id === "confirm") closeConfirm(); });
    $("#clearBtn").addEventListener("click", () => {
      state.q = ""; state.filters = {}; state.page = 1; $("#search").value = ""; syncFilterUI(); renderStats(); load();
    });
    let timer;
    $("#search").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; syncFilterUI(); load(); }, 250);
    });
    $("#colsBtn").addEventListener("click", (e) => { e.stopPropagation(); $("#colsMenu").hidden = !$("#colsMenu").hidden; });
    document.addEventListener("click", (e) => { if (!e.target.closest(".menu-wrap")) $("#colsMenu").hidden = true; });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#confirm").hidden) closeConfirm();
      else if (!$("#colsMenu").hidden) $("#colsMenu").hidden = true;
      else if ($("#drawer").classList.contains("open")) showDrawer(false);
    });
    $("#drawer").inert = true;
    const start = location.hash.replace("#", "");
    switchView(VIEWS[start] ? start : "updates", false);
    loadMeta();
  }

  init();
})();
