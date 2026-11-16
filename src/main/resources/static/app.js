/* Coordinate Converter: front-end behaviour (plain JavaScript, no libraries). */
(() => {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const MAX_BYTES = 5 * 1024 * 1024;
    const MAX_STOPS = 1000;

    /* ------------------------------------------------------------------
       Theme: follow the system, let the user override, remember the choice
       ------------------------------------------------------------------ */
    const root = document.documentElement;
    const themeToggle = $("themeToggle");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

    const currentTheme = () =>
        root.getAttribute("data-theme") || (systemDark.matches ? "dark" : "light");

    function syncThemeToggle() {
        themeToggle.setAttribute(
            "aria-label",
            currentTheme() === "dark" ? "Switch to light theme" : "Switch to dark theme");
    }

    themeToggle.addEventListener("click", () => {
        const next = currentTheme() === "dark" ? "light" : "dark";
        root.classList.add("theme-changing");
        root.setAttribute("data-theme", next);
        requestAnimationFrame(() =>
            requestAnimationFrame(() => root.classList.remove("theme-changing")));
        try { localStorage.setItem("theme", next); } catch (e) { /* storage blocked */ }
        syncThemeToggle();
    });
    systemDark.addEventListener("change", syncThemeToggle);
    syncThemeToggle();

    /* ------------------------------------------------------------------
       Small helpers
       ------------------------------------------------------------------ */
    function setStatus(el, type, text) {
        el.textContent = text || "";
        if (type) {
            el.dataset.type = type;
        } else {
            delete el.dataset.type;
        }
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    /** @returns null when empty, NaN when not a number, otherwise the number */
    function parseNumber(text) {
        const cleaned = text.trim().replace(",", ".");
        if (cleaned === "") return null;
        const value = Number(cleaned);
        return Number.isFinite(value) ? value : NaN;
    }

    /** Pull a readable message out of an error response from the server. */
    async function errorMessage(response) {
        if (response.status === 413) {
            return "That file is over 5 MB. Remove extra sheets or rows and try again.";
        }
        try {
            const data = await response.json();
            if (data && data.details) return Object.values(data.details).join(" ");
            if (data && data.error) return data.error;
        } catch (e) { /* not JSON */ }
        return "The conversion failed (error " + response.status + "). Try again.";
    }

    const NETWORK_MESSAGE =
        "Could not reach the converter. Check that the app is running, then try again.";

    /* ------------------------------------------------------------------
       Stops to Go.csv: shared by the Excel upload and the typed-in stops
       ------------------------------------------------------------------ */
    const steps = { file: $("step-file"), convert: $("step-convert"), done: $("step-done") };
    const convertBtn = $("convertBtn");
    const spinner = $("spinner");
    const convertStatus = $("convertStatus");
    const result = $("result");
    const doneHint = $("doneHint");
    const summary = $("summary");
    const preview = $("preview");
    const downloadAgain = $("downloadAgain");

    let mode = "file";          // "file" (Excel upload) or "manual" (typed in)
    let selectedFile = null;
    let busy = false;
    let downloadUrl = null;

    /** Each step shows where the user is on the line. */
    function setPhase(phase) {
        const states = {
            idle: ["active", "upcoming", "upcoming"],
            ready: ["done", "active", "upcoming"],
            success: ["done", "done", "done"]
        }[phase];
        steps.file.dataset.state = states[0];
        steps.convert.dataset.state = states[1];
        steps.done.dataset.state = states[2];
    }

    /** Is there something to convert in the way of adding stops that is showing? */
    function sourceReady() {
        return mode === "file" ? Boolean(selectedFile) : manualHasCompleteRow();
    }

    function refreshPhase() {
        setPhase(sourceReady() ? "ready" : "idle");
    }

    function updateButton() {
        convertBtn.disabled = !sourceReady() || busy;
    }

    function clearResult() {
        if (downloadUrl) {
            URL.revokeObjectURL(downloadUrl);
            downloadUrl = null;
        }
        result.hidden = true;
        doneHint.hidden = false;
        preview.replaceChildren();
    }

    /* Read the rows of the Go.csv the server sent back, to draw the route. */
    function parseCsvLine(line) {
        const fields = [];
        let current = "";
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (quoted) {
                if (ch === '"') {
                    if (line[i + 1] === '"') { current += '"'; i++; } else { quoted = false; }
                } else {
                    current += ch;
                }
            } else if (ch === '"') {
                quoted = true;
            } else if (ch === ",") {
                fields.push(current);
                current = "";
            } else {
                current += ch;
            }
        }
        fields.push(current);
        return fields;
    }

    function parseGoCsv(text) {
        const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
        if (lines.length < 2) return [];
        const header = parseCsvLine(lines[0]);
        const col = (name) => header.indexOf(name);
        const nameCol = col("NAME"), latCol = col("LAT"), lonCol = col("LONG"), typeCol = col("TYPE");

        return lines.slice(1).map(parseCsvLine)
            .filter((fields) => fields.length > Math.max(nameCol, latCol, lonCol, typeCol))
            .map((fields) => ({
                name: fields[nameCol],
                lat: fields[latCol],
                lon: fields[lonCol],
                type: fields[typeCol]
            }));
    }

    function drawRoute(stops) {
        const items = stops.map((stop) => {
            const kind = stop.type === "StartStation" ? "start"
                : stop.type === "EndStation" ? "end" : "stop";

            const li = document.createElement("li");
            li.dataset.kind = kind;

            const name = document.createElement("span");
            name.className = "stop-name";
            name.textContent = stop.name;
            if (kind !== "stop") {
                const tag = document.createElement("span");
                tag.className = "stop-tag";
                tag.textContent = kind === "start" ? "Start" : "End";
                name.append(tag);
            }

            const coords = document.createElement("span");
            coords.className = "stop-coords";
            coords.textContent = stop.lat + ", " + stop.lon;

            li.append(name, coords);
            return li;
        });
        preview.replaceChildren(...items);
    }

    function showResult(blob, stops) {
        downloadUrl = URL.createObjectURL(blob);
        downloadAgain.href = downloadUrl;

        const count = stops.length;
        const strong = document.createElement("strong");
        strong.textContent = count + (count === 1 ? " stop" : " stops");
        summary.replaceChildren(strong, " converted.");

        drawRoute(stops);
        doneHint.hidden = true;
        result.hidden = false;
        setPhase("success");
    }

    function download(url) {
        const link = document.createElement("a");
        link.href = url;
        link.download = "Go.csv";
        document.body.append(link);
        link.click();
        link.remove();
    }

    /** Send the stops to the server, then show and download the Go.csv it returns. */
    async function runConversion(sendRequest) {
        busy = true;
        spinner.hidden = false;
        updateButton();
        setStatus(convertStatus, "", "Converting...");
        clearResult();
        setPhase("ready");

        try {
            const response = await sendRequest();
            if (!response.ok) throw new Error(await errorMessage(response));

            const blob = await response.blob();
            const stops = parseGoCsv(await blob.text());
            showResult(blob, stops);
            download(downloadUrl);
            setStatus(convertStatus, "ok", "Done. Go.csv was downloaded to your computer.");
        } catch (error) {
            setStatus(convertStatus, "error",
                error instanceof TypeError ? NETWORK_MESSAGE : error.message);
        } finally {
            busy = false;
            spinner.hidden = true;
            updateButton();
        }
    }

    convertBtn.addEventListener("click", () => {
        if (mode === "file") {
            convertFile();
        } else {
            convertManual();
        }
    });

    /* ------------------------------------------------------------------
       Choosing between "Excel file" and "Type stops in"
       ------------------------------------------------------------------ */
    const tabs = { file: $("tab-file"), manual: $("tab-manual") };
    const panels = { file: $("panel-file"), manual: $("panel-manual") };

    function setMode(next, moveFocus) {
        mode = next;
        for (const key of Object.keys(tabs)) {
            const selected = key === next;
            tabs[key].setAttribute("aria-selected", String(selected));
            tabs[key].tabIndex = selected ? 0 : -1;
            panels[key].hidden = !selected;
        }
        if (moveFocus) tabs[next].focus();

        // The old result belongs to the other way of adding stops.
        clearResult();
        setStatus(convertStatus, "", "");
        refreshPhase();
        updateButton();
    }

    Object.keys(tabs).forEach((key) =>
        tabs[key].addEventListener("click", () => setMode(key, false)));

    document.querySelector('[role="tablist"]').addEventListener("keydown", (event) => {
        const order = ["file", "manual"];
        const index = order.indexOf(mode);
        let next = null;
        if (event.key === "ArrowRight") next = order[(index + 1) % order.length];
        if (event.key === "ArrowLeft") next = order[(index + order.length - 1) % order.length];
        if (event.key === "Home") next = order[0];
        if (event.key === "End") next = order[order.length - 1];
        if (next) {
            event.preventDefault();
            setMode(next, true);
        }
    });

    /* ------------------------------------------------------------------
       Way 1: Excel file
       ------------------------------------------------------------------ */
    const fileInput = $("excelFile");
    const dropzone = $("dropzone");
    const dropTitle = $("dropTitle");
    const dropSub = $("dropSub");
    const dropSubDefault = dropSub.innerHTML;
    const dropTitleDefault = dropTitle.textContent;

    function clearSelection() {
        selectedFile = null;
        fileInput.value = "";
        delete dropzone.dataset.hasFile;
        dropTitle.textContent = dropTitleDefault;
        dropSub.innerHTML = dropSubDefault;
        clearResult();
        refreshPhase();
        updateButton();
    }

    function chooseFile(file) {
        setStatus(convertStatus, "", "");
        if (!file) {
            clearSelection();
            return;
        }
        if (!/\.xlsx$/i.test(file.name)) {
            clearSelection();
            setStatus(convertStatus, "error",
                "That file is not an .xlsx. In Excel, choose Save As, then Excel Workbook (.xlsx), and try again.");
            return;
        }
        if (file.size > MAX_BYTES) {
            clearSelection();
            setStatus(convertStatus, "error",
                "That file is over 5 MB. Remove extra sheets or rows and try again.");
            return;
        }

        selectedFile = file;
        clearResult();
        dropzone.dataset.hasFile = "";
        dropTitle.textContent = file.name;
        dropSub.textContent = formatSize(file.size) + ". Click to choose a different file.";
        refreshPhase();
        updateButton();
    }

    fileInput.addEventListener("change", () => chooseFile(fileInput.files[0]));

    /* Drag and drop */
    ["dragenter", "dragover"].forEach((type) =>
        dropzone.addEventListener(type, (event) => {
            event.preventDefault();
            dropzone.dataset.dragging = "";
        }));

    dropzone.addEventListener("dragleave", (event) => {
        if (!dropzone.contains(event.relatedTarget)) delete dropzone.dataset.dragging;
    });

    dropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        delete dropzone.dataset.dragging;
        const file = event.dataTransfer.files[0];
        if (!file) return;
        try {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            fileInput.files = transfer.files;
        } catch (e) { /* older browsers: the file is still used below */ }
        chooseFile(file);
    });

    /* A file dropped outside the zone should not make the browser open it. */
    window.addEventListener("dragover", (event) => event.preventDefault());
    window.addEventListener("drop", (event) => event.preventDefault());

    function convertFile() {
        if (!selectedFile) {
            setStatus(convertStatus, "error", "Choose an Excel file (.xlsx) first.");
            return;
        }
        return runConversion(() => {
            const body = new FormData();
            body.append("file", selectedFile);
            return fetch("/api/stops/convert", { method: "POST", body });
        });
    }

    /* ------------------------------------------------------------------
       Way 2: type the stops in
       ------------------------------------------------------------------ */
    const manualRows = $("manualRows");
    const STARTING_ROWS = 2;
    const EXAMPLE = { latitude: "-25.984409", longitude: "28.237797" };

    const ICON_UP = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const ICON_DOWN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const ICON_REMOVE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

    /** One row for one stop. The markup is fixed text; the user's words only ever go in input values. */
    function createRow() {
        const li = document.createElement("li");
        li.className = "manual-row";
        li.innerHTML =
            '<span class="row-id"><span class="row-no"></span><span class="row-tag"></span></span>' +
            '<label class="cell cell-name"><span class="cell-label" aria-hidden="true">Station name</span>' +
            '<input type="text" data-field="name" maxlength="120" autocomplete="off" placeholder="Tembisa Hospital"></label>' +
            '<label class="cell cell-lat"><span class="cell-label" aria-hidden="true">Latitude</span>' +
            '<input type="text" inputmode="decimal" data-field="lat" autocomplete="off" placeholder="' + EXAMPLE.latitude + '"></label>' +
            '<label class="cell cell-lon"><span class="cell-label" aria-hidden="true">Longitude</span>' +
            '<input type="text" inputmode="decimal" data-field="lon" autocomplete="off" placeholder="' + EXAMPLE.longitude + '"></label>' +
            '<span class="row-tools">' +
            '<button type="button" class="icon-btn" data-action="up">' + ICON_UP + '</button>' +
            '<button type="button" class="icon-btn" data-action="down">' + ICON_DOWN + '</button>' +
            '<button type="button" class="icon-btn" data-action="remove">' + ICON_REMOVE + '</button>' +
            '</span>';
        return li;
    }

    const field = (row, name) => row.querySelector('[data-field="' + name + '"]');
    const rowList = () => Array.from(manualRows.children);

    /** Keep numbers, Start/End tags, accessible names and disabled arrows in step with the order. */
    function renumberRows() {
        const rows = rowList();
        rows.forEach((row, index) => {
            const n = index + 1;
            const isFirst = index === 0;
            const isLast = index === rows.length - 1;

            row.querySelector(".row-no").textContent = n;

            field(row, "name").setAttribute("aria-label", "Station name, stop " + n);
            field(row, "lat").setAttribute("aria-label", "Latitude, stop " + n);
            field(row, "lon").setAttribute("aria-label", "Longitude, stop " + n);

            const up = row.querySelector('[data-action="up"]');
            const down = row.querySelector('[data-action="down"]');
            const remove = row.querySelector('[data-action="remove"]');
            up.setAttribute("aria-label", "Move stop " + n + " up");
            down.setAttribute("aria-label", "Move stop " + n + " down");
            remove.setAttribute("aria-label", "Remove stop " + n);
            up.disabled = isFirst;
            down.disabled = isLast;
        });
        updateTags();
    }

    /**
     * Mark the first and last stop that has something typed in. Empty rows are ignored when
     * converting, so they never count as the start or the end.
     */
    function updateTags() {
        const rows = rowList();
        let filled = rows.filter((row) => {
            const v = rowValues(row);
            return v.name !== "" || v.lat !== "" || v.lon !== "";
        });
        if (filled.length === 0) filled = rows; // nothing typed yet: hint at the start and the end

        rows.forEach((row) => { row.querySelector(".row-tag").textContent = ""; });
        if (filled.length > 1) {
            filled[0].querySelector(".row-tag").textContent = "Start";
            filled[filled.length - 1].querySelector(".row-tag").textContent = "End";
        }
    }

    function addRow(focusName) {
        if (manualRows.children.length >= MAX_STOPS) {
            setStatus(convertStatus, "error",
                "That is the most stops that can be converted at once (" + MAX_STOPS + ").");
            return null;
        }
        const row = createRow();
        manualRows.append(row);
        renumberRows();
        if (focusName) field(row, "name").focus();
        return row;
    }

    const rowValues = (row) => ({
        name: field(row, "name").value.trim(),
        lat: field(row, "lat").value.trim(),
        lon: field(row, "lon").value.trim()
    });

    function manualHasCompleteRow() {
        return rowList().some((row) => {
            const v = rowValues(row);
            return v.name !== "" && v.lat !== "" && v.lon !== "";
        });
    }

    /** Typing changes what would be converted, so an earlier result is out of date. */
    function manualChanged() {
        if (downloadUrl || !result.hidden) clearResult();
        setStatus(convertStatus, "", "");
        refreshPhase();
        updateButton();
    }

    function clearInvalid() {
        manualRows.querySelectorAll('[aria-invalid="true"]')
            .forEach((input) => input.removeAttribute("aria-invalid"));
    }

    /**
     * Check every row. Empty rows are skipped; a row with only some boxes filled is a problem.
     * @returns {{stops: object[], message: string|null, firstBad: HTMLElement|null}}
     */
    function collectManualStops() {
        clearInvalid();
        const problems = [];
        const stops = [];

        rowList().forEach((row, index) => {
            const n = index + 1;
            const nameInput = field(row, "name");
            const latInput = field(row, "lat");
            const lonInput = field(row, "lon");
            const name = nameInput.value.trim().replace(/\s+/g, " ");

            if (name === "" && latInput.value.trim() === "" && lonInput.value.trim() === "") {
                return; // an empty row is simply ignored
            }

            const label = name ? "Stop " + n + " (" + name + ")" : "Stop " + n;
            const before = problems.length;
            const problem = (input, text) => problems.push({ input, message: label + ": " + text });

            if (name === "") problem(nameInput, "enter the station name.");

            const check = (input, what, limit, example) => {
                const value = parseNumber(input.value);
                if (value === null) {
                    problem(input, "enter the " + what + ".");
                } else if (Number.isNaN(value)) {
                    problem(input, "the " + what + " must be a number, for example " + example + ".");
                } else if (Math.abs(value) > limit) {
                    problem(input, "the " + what + " must be between -" + limit + " and " + limit + ".");
                }
                return value;
            };
            const latitude = check(latInput, "latitude", 90, EXAMPLE.latitude);
            const longitude = check(lonInput, "longitude", 180, EXAMPLE.longitude);

            if (problems.length === before) {
                stops.push({ name, latitude, longitude });
            }
        });

        if (problems.length > 0) {
            problems.forEach((p) => p.input.setAttribute("aria-invalid", "true"));
            const extra = problems.length > 1 ? " " + (problems.length - 1) + " more to fix." : "";
            return { stops, message: problems[0].message + extra, firstBad: problems[0].input };
        }
        if (stops.length === 0) {
            return { stops, message: "Add at least one stop.", firstBad: field(rowList()[0], "name") };
        }
        return { stops, message: null, firstBad: null };
    }

    function convertManual() {
        const collected = collectManualStops();
        if (collected.message) {
            setStatus(convertStatus, "error", collected.message);
            collected.firstBad.focus();
            return;
        }
        return runConversion(() => fetch("/api/stops/convert-manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stops: collected.stops })
        }));
    }

    function hasAnyTypedText() {
        return rowList().some((row) => {
            const v = rowValues(row);
            return v.name !== "" || v.lat !== "" || v.lon !== "";
        });
    }

    function resetRows() {
        manualRows.replaceChildren();
        for (let i = 0; i < STARTING_ROWS; i++) addRow(false);
        manualChanged();
    }

    /* Buttons inside a row: move up, move down, remove */
    manualRows.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        const row = button.closest(".manual-row");
        const action = button.dataset.action;

        if (action === "up" && row.previousElementSibling) {
            row.previousElementSibling.before(row);
        } else if (action === "down" && row.nextElementSibling) {
            row.nextElementSibling.after(row);
        } else if (action === "remove") {
            if (manualRows.children.length === 1) {
                ["name", "lat", "lon"].forEach((f) => { field(row, f).value = ""; });
                field(row, "name").focus();
            } else {
                const neighbour = row.nextElementSibling || row.previousElementSibling;
                row.remove();
                field(neighbour, "name").focus();
            }
        }

        renumberRows();
        if (action === "up" || action === "down") {
            // keep the keyboard on the same stop, even when its arrow has just switched off
            const same = row.querySelector('[data-action="' + action + '"]');
            (same.disabled ? row.querySelector('[data-action="' + (action === "up" ? "down" : "up") + '"]') : same).focus();
        }
        clearInvalid();
        manualChanged();
    });

    manualRows.addEventListener("input", (event) => {
        if (event.target.matches("input")) {
            event.target.removeAttribute("aria-invalid");
            updateTags();
            manualChanged();
        }
    });

    /* Enter moves on: name, then latitude, then longitude, then the next stop (a new one after the last). */
    manualRows.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || !event.target.matches("input")) return;
        event.preventDefault();
        const row = event.target.closest(".manual-row");
        const which = event.target.dataset.field;

        if (which === "name") {
            field(row, "lat").focus();
        } else if (which === "lat") {
            field(row, "lon").focus();
        } else {
            const next = row.nextElementSibling || addRow(false);
            if (next) field(next, "name").focus();
        }
    });

    $("addRowBtn").addEventListener("click", () => addRow(true));

    $("clearRowsBtn").addEventListener("click", () => {
        if (hasAnyTypedText() && !window.confirm("Remove all the stops you typed in?")) return;
        resetRows();
        field(rowList()[0], "name").focus();
    });

    resetRows();

    /* ------------------------------------------------------------------
       Convert one coordinate
       ------------------------------------------------------------------ */
    const singleForm = $("singleForm");
    const latInput = $("latitude");
    const lonInput = $("longitude");
    const singleStatus = $("singleStatus");
    const readouts = $("readouts");

    /** 2559.065 is 25 degrees and 59.065 minutes: show both parts. */
    function describe(converted, original) {
        const degrees = Math.floor(converted / 100);
        const minutes = (converted - degrees * 100).toFixed(3);
        return degrees + "° " + minutes + "′ from " + original;
    }

    singleForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        readouts.hidden = true;

        const latitude = parseNumber(latInput.value);
        const longitude = parseNumber(lonInput.value);

        if (latitude === null || longitude === null) {
            setStatus(singleStatus, "error", "Enter both a latitude and a longitude.");
            return;
        }
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
            setStatus(singleStatus, "error",
                "Latitude and longitude must be numbers, for example -25.984409.");
            return;
        }

        try {
            setStatus(singleStatus, "", "Converting...");
            const response = await fetch("/api/coordinates/convert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latitude, longitude })
            });
            if (!response.ok) throw new Error(await errorMessage(response));

            const data = await response.json();
            $("outLat").textContent = data.latitude.toFixed(3);
            $("outLon").textContent = data.longitude.toFixed(3);
            $("outLatDetail").textContent = describe(data.latitude, latitude);
            $("outLonDetail").textContent = describe(data.longitude, longitude);
            readouts.hidden = false;
            setStatus(singleStatus, "ok", "Converted.");
        } catch (error) {
            setStatus(singleStatus, "error",
                error instanceof TypeError ? NETWORK_MESSAGE : error.message);
        }
    });

    $("clearBtn").addEventListener("click", () => {
        latInput.value = "";
        lonInput.value = "";
        readouts.hidden = true;
        setStatus(singleStatus, "", "");
        latInput.focus();
    });
})();
