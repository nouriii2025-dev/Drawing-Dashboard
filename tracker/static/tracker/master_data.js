(() => {
    "use strict";

    const csrf = document.querySelector('meta[name="csrf"]').content;
    const categories = [
        { key: "status", title: "Status", description: "Drawing progress and approval status.", icon: "✓" },
        { key: "drawn_by", title: "Drawn By", description: "People responsible for preparing drawings.", icon: "✎" },
        { key: "software", title: "Software", description: "Software options used for drawing preparation.", icon: "▦" },
        { key: "sales_person", title: "Sales Person", description: "Sales team members assigned to drawings.", icon: "♙" }
    ];
    const $ = selector => document.querySelector(selector);
    let masterData = {};
    let activeCategory = null;

    async function api(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: { "Content-Type": "application/json", "X-CSRFToken": csrf, ...(options.headers || {}) }
        });
        if (!response.ok) {
            let body = {};
            try { body = await response.json(); } catch (e) {}
            throw new Error(body.error || "Request failed.");
        }
        return response.status === 204 ? null : response.json();
    }

    function toast(message, error = false) {
        const el = document.createElement("div");
        el.className = "toast" + (error ? " error" : "");
        el.textContent = message;
        $("#toasts").append(el);
        setTimeout(() => el.remove(), 3000);
    }

    function renderCards() {
        const grid = $("#masterGrid");
        grid.replaceChildren();
        categories.forEach(category => {
            const items = masterData[category.key]?.items || [];
            const card = document.createElement("button");
            card.type = "button";
            card.className = "master-category-card";
            card.setAttribute("aria-label", `Open ${category.title}`);
            const icon = document.createElement("span");
            icon.className = "category-icon";
            icon.textContent = category.icon;
            const copy = document.createElement("div");
            copy.className = "category-copy";
            const title = document.createElement("h2");
            title.textContent = category.title;
            const description = document.createElement("p");
            description.textContent = category.description;
            const meta = document.createElement("div");
            meta.className = "category-meta";
            const count = document.createElement("span");
            count.className = "category-count";
            count.textContent = items.length;
            const countLabel = document.createElement("span");
            countLabel.textContent = items.length === 1 ? "saved value" : "saved values";
            meta.append(count, countLabel);
            copy.append(title, description, meta);
            const arrow = document.createElement("span");
            arrow.className = "category-arrow";
            arrow.textContent = "›";
            card.append(icon, copy, arrow);
            card.addEventListener("click", () => openCategory(category.key));
            grid.append(card);
        });
    }

    function openCategory(key) {
        activeCategory = categories.find(category => category.key === key);
        if (!activeCategory) return;
        $("#masterHome").hidden = true;
        $("#masterDetail").hidden = false;
        $("#detailTitle").textContent = activeCategory.title;
        $("#detailDescription").textContent = activeCategory.description;
        renderList();
        $("#masterValueInput").focus();
    }

    function renderList() {
        if (!activeCategory) return;
        const items = masterData[activeCategory.key]?.items || [];
        $("#detailCount").textContent = `${items.length} ${items.length === 1 ? "value" : "values"}`;
        const list = $("#masterList");
        list.replaceChildren();
        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "master-empty";
            empty.textContent = "No values have been added to this category yet.";
            list.append(empty);
            return;
        }
        items.forEach(item => {
            const row = document.createElement("div");
            row.className = "master-item";
            const name = document.createElement("span");
            name.className = "master-item-name";
            name.textContent = item.value;
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "master-delete";
            remove.textContent = "Remove";
            remove.addEventListener("click", async () => {
                if (!confirm(`Remove ${item.value}?`)) return;
                remove.disabled = true;
                try {
                    await api(`/api/master-data/${item.id}/`, { method: "DELETE" });
                    toast("Value removed successfully");
                    await refresh();
                } catch (error) {
                    toast(error.message, true);
                    remove.disabled = false;
                }
            });
            row.append(name, remove);
            list.append(row);
        });
    }

    async function refresh() {
        try {
            masterData = await api("/api/master-data/");
            renderCards();
            if (activeCategory) renderList();
        } catch (error) {
            $("#masterGrid").textContent = error.message;
            toast(error.message, true);
        }
    }

    $("#backToCategories").addEventListener("click", () => {
        activeCategory = null;
        $("#masterDetail").hidden = true;
        $("#masterHome").hidden = false;
        renderCards();
    });

    $("#masterAddForm").addEventListener("submit", async event => {
        event.preventDefault();
        if (!activeCategory) return;
        const input = $("#masterValueInput");
        const button = $("#masterAddButton");
        button.disabled = true;
        try {
            await api("/api/master-data/", {
                method: "POST",
                body: JSON.stringify({ category: activeCategory.key, value: input.value })
            });
            input.value = "";
            toast(`${activeCategory.title} value added successfully`);
            await refresh();
            input.focus();
        } catch (error) {
            toast(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    refresh();
})();
