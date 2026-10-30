(function () {
  "use strict";

  const STORAGE_KEY = "contactHubContacts";
  const MAX_PHOTO_BYTES = 450 * 1024;
  const MAX_PHOTO_INPUT_BYTES = 1.6 * 1024 * 1024;

  let contacts = [];
  let editingId = null;
  let pendingPhoto = "";
  let modalInstance = null;

  const $ = (id) => document.getElementById(id);

  const gridAll = $("allContactsGrid");
  const gridFav = $("favoritesGrid");
  const gridEmg = $("emergencyGrid");
  const emptyAll = $("allContactsEmpty");
  const emptyFav = $("favoritesEmpty");
  const emptyEmg = $("emergencyEmpty");
  const searchInput = $("searchInput");
  const searchClear = $("searchClear");
  const subtitleAll = $("allContactsSubtitle");

  function loadContacts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error("Failed to load contacts:", err);
      return [];
    }
  }

  function saveContacts() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
      return true;
    } catch (err) {
      console.error("LocalStorage save failed:", err);
      Swal.fire({
        icon: "error",
        title: "Storage limit reached",
        text: "Could not save. Try using smaller photos or removing unused contacts.",
        confirmButtonColor: "#3b5bdb",
      });
      return false;
    }
  }

  function uid() {
    return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function colorFromString(str) {
    const palette = [
      "#3b5bdb", "#0ca678", "#d9480f", "#1971c2",
      "#9c36b5", "#e8590c", "#2f9e44", "#c2255c",
      "#1098ad", "#5f3dc4", "#e03131", "#1864ab",
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function normalizePhone(phone) {
    let p = phone.trim();
    const leadingPlus = p.startsWith("+");
    p = p.replace(/[^\d]/g, "");
    if (leadingPlus) p = "+" + p;
    return p;
  }

  function telHref(phone) {
    const n = normalizePhone(phone);
    if (!n) return "#";
    return "tel:" + n.replace(/\s+/g, "");
  }

  function mailtoHref(email) {
    const e = (email || "").trim();
    if (!e) return "";
    return "mailto:" + e;
  }

  function buildAvatar(contact) {
    if (contact.photo) {
      return `<img src="${escapeHtml(contact.photo)}" class="contact-avatar" alt="${escapeHtml(contact.name)}" />`;
    }
    const bg = colorFromString(contact.name || "?");
    return `<span class="contact-initials" style="background:${bg}">${escapeHtml(initials(contact.name || "?"))}</span>`;
  }

  function contactCardHTML(c) {
    const fav = c.isFavorite
      ? `<button class="fav-btn is-fav" data-action="favorite" data-id="${escapeHtml(c.id)}" aria-label="Remove favorite" title="Remove favorite"><i class="bi bi-star-fill"></i></button>`
      : `<button class="fav-btn" data-action="favorite" data-id="${escapeHtml(c.id)}" aria-label="Add favorite" title="Add favorite"><i class="bi bi-star"></i></button>`;

    const emg = c.isEmergency
      ? `<span class="emergency-badge"><i class="bi bi-shield-exclamation"></i> Emergency</span>`
      : "";

    const groupClass = "group-" + (["Family", "Friends", "Work", "Other"].includes(c.group) ? c.group : "Other");

    let info = "";
    info += `<div class="info-line"><i class="bi bi-telephone"></i><a href="${telHref(c.phone)}" aria-label="Call ${escapeHtml(c.name)}">${escapeHtml(c.phone || "—")}</a></div>`;
    if (c.email) {
      info += `<div class="info-line"><i class="bi bi-envelope"></i><a href="${mailtoHref(c.email)}" aria-label="Email ${escapeHtml(c.name)}">${escapeHtml(c.email)}</a></div>`;
    }
    if (c.address) {
      info += `<div class="info-line"><i class="bi bi-geo-alt"></i><span>${escapeHtml(c.address)}</span></div>`;
    }
    if (c.notes) {
      info += `<div class="info-line"><i class="bi bi-sticky"></i><span>${escapeHtml(c.notes)}</span></div>`;
    }

    const mailEnabled = c.email && c.email.trim();
    const emailBtn = mailEnabled
      ? `<a class="act-btn act-email" href="${mailtoHref(c.email)}" aria-label="Email ${escapeHtml(c.name)}" title="Email"><i class="bi bi-envelope"></i></a>`
      : `<span class="act-btn act-email disabled" aria-disabled="true" title="No email"><i class="bi bi-envelope"></i></span>`;

    return `
      <article class="contact-card" data-id="${escapeHtml(c.id)}">
        <div class="card-top">
          ${buildAvatar(c)}
          <div class="card-name-block">
            <h3 class="contact-name">${escapeHtml(c.name)}</h3>
            <span class="group-badge ${groupClass}">${escapeHtml(c.group || "Other")}</span>
          </div>
          ${emg}
          ${fav}
        </div>
        <div class="card-body-info">${info}</div>
        <div class="card-actions">
          <a class="act-btn act-call" href="${telHref(c.phone)}" aria-label="Call ${escapeHtml(c.name)}" title="Call"><i class="bi bi-telephone"></i></a>
          ${emailBtn}
          <button class="act-btn act-edit" data-action="edit" data-id="${escapeHtml(c.id)}" aria-label="Edit ${escapeHtml(c.name)}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="act-btn act-delete" data-action="delete" data-id="${escapeHtml(c.id)}" aria-label="Delete ${escapeHtml(c.name)}" title="Delete"><i class="bi bi-trash"></i></button>
        </div>
      </article>`;
  }

  function renderGrid(gridEl, emptyEl, list) {
    if (!list.length) {
      gridEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }
    emptyEl.style.display = "none";
    gridEl.innerHTML = list.map(contactCardHTML).join("");
  }

  function emptyStateHTML(icon, title, text) {
    return `<div class="empty-icon"><i class="bi ${icon}"></i></div><h5>${escapeHtml(title)}</h5><p>${escapeHtml(text)}</p>`;
  }

  function renderEmptyStates(searching) {
    emptyAll.innerHTML = emptyStateHTML(
      searching ? "bi-search" : "bi-person-plus",
      searching ? "No matching contacts" : "No contacts yet",
      searching
        ? "Try a different name, phone number, or email."
        : "Click “Add Contact” to create your first contact."
    );
    emptyFav.innerHTML = emptyStateHTML(
      "bi-star",
      "No favorites yet",
      "Tap the star on any contact to pin it here for quick access."
    );
    emptyEmg.innerHTML = emptyStateHTML(
      "bi-shield-exclamation",
      "No emergency contacts",
      "Mark important contacts as emergency for urgent access."
    );
  }

  function renderContacts() {
    const term = (searchInput.value || "").trim().toLowerCase();
    const searching = term.length > 0;

    const filtered = searching
      ? contacts.filter((c) => {
        return (
          (c.name || "").toLowerCase().includes(term) ||
          (c.phone || "").toLowerCase().includes(term) ||
          (c.email || "").toLowerCase().includes(term)
        );
      })
      : contacts.slice();

    renderGrid(gridAll, emptyAll, filtered);

    const favorites = contacts.filter((c) => c.isFavorite);
    const emergencies = contacts.filter((c) => c.isEmergency);
    renderGrid(gridFav, emptyFav, favorites);
    renderGrid(gridEmg, emptyEmg, emergencies);

    renderEmptyStates(searching);
    subtitleAll.textContent = searching
      ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}`
      : `${contacts.length} contact${contacts.length === 1 ? "" : "s"} in total`;
  }

  function updateStatistics() {
    $("statTotal").textContent = contacts.length;
    $("statFavorites").textContent = contacts.filter((c) => c.isFavorite).length;
    $("statEmergency").textContent = contacts.filter((c) => c.isEmergency).length;
  }

  function renderAll() {
    renderContacts();
    updateStatistics();
  }

  function onSearchInput() {
    const hasText = searchInput.value.trim().length > 0;
    searchClear.classList.toggle("d-none", !hasText);
    renderContacts();
  }

  function resetForm() {
    const form = $("contactForm");
    form.reset();
    form.classList.remove("was-validated");
    ["contactName", "contactPhone", "contactEmail", "contactAddress", "contactNotes"].forEach((id) => {
      const el = $(id);
      el.classList.remove("is-invalid", "is-valid");
    });
    clearError("nameError");
    clearError("phoneError");
    clearError("emailError");
    clearError("addressError");
    pendingPhoto = "";
    showPhotoPreview("");
  }

  function openAddContactModal() {
    editingId = null;
    resetForm();
    $("contactModalTitle").textContent = "Add New Contact";
    $("btnSaveContact").textContent = "Save Contact";
    modalInstance.show();
  }

  function openEditContactModal(id) {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    editingId = id;
    resetForm();

    $("contactModalTitle").textContent = "Edit Contact";
    $("btnSaveContact").textContent = "Update Contact";
    $("contactName").value = c.name || "";
    $("contactPhone").value = c.phone || "";
    $("contactEmail").value = c.email || "";
    $("contactAddress").value = c.address || "";
    $("contactGroup").value = ["Family", "Friends", "Work", "Other"].includes(c.group) ? c.group : "Other";
    $("contactNotes").value = c.notes || "";
    $("contactFavorite").checked = !!c.isFavorite;
    $("contactEmergency").checked = !!c.isEmergency;
    pendingPhoto = c.photo || "";
    showPhotoPreview(pendingPhoto);

    modalInstance.show();
  }

  function showPhotoPreview(dataUrl) {
    const preview = $("photoPreview");
    const removeBtn = $("btnRemovePhoto");
    if (dataUrl) {
      preview.innerHTML = `<img src="${escapeHtml(dataUrl)}" alt="Preview" />`;
      removeBtn.classList.remove("d-none");
    } else {
      preview.innerHTML = `<i class="bi bi-person-circle photo-placeholder-icon"></i>`;
      removeBtn.classList.add("d-none");
    }
  }

  function onPhotoSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      Swal.fire({ icon: "error", title: "Invalid file", text: "Please choose an image file.", confirmButtonColor: "#3b5bdb" });
      e.target.value = "";
      return;
    }
    if (file.size > MAX_PHOTO_INPUT_BYTES) {
      Swal.fire({ icon: "error", title: "Image too large", text: "Please choose an image under 1.6 MB.", confirmButtonColor: "#3b5bdb" });
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = function () {
      const dataUrl = reader.result;
      if (dataUrl.length > MAX_PHOTO_BYTES) {
        Swal.fire({ icon: "warning", title: "Image too large", text: "This photo is too big for storage. Please use a smaller image.", confirmButtonColor: "#3b5bdb" });
        e.target.value = "";
        return;
      }
      pendingPhoto = dataUrl;
      showPhotoPreview(pendingPhoto);
    };
    reader.onerror = function () {
      Swal.fire({ icon: "error", title: "Read failed", text: "Could not read the selected image.", confirmButtonColor: "#3b5bdb" });
    };
    reader.readAsDataURL(file);
  }

  function setError(fieldId, errorId, msg) {
    $(fieldId).classList.add("is-invalid");
    $(fieldId).classList.remove("is-valid");
    $(errorId).textContent = msg;
  }
  function clearError(errorId) {
    const el = $(errorId);
    if (el) el.textContent = "";
  }
  function setValid(fieldId) {
    const el = $(fieldId);
    if (el) {
      el.classList.remove("is-invalid");
      el.classList.add("is-valid");
    }
  }

  function validateContactForm() {
    let ok = true;
    const name = $("contactName").value.trim();
    const phone = $("contactPhone").value.trim();
    const email = $("contactEmail").value.trim();
    const address = $("contactAddress").value.trim();

    const nameRegex = /^[\p{L}\s.'-]{2,50}$/u;
    if (!name) {
      setError("contactName", "nameError", "Full name is required.");
      ok = false;
    } else if (!nameRegex.test(name)) {
      setError("contactName", "nameError", "Use 2–50 letters, spaces, or standard punctuation only.");
      ok = false;
    } else if (/\d/.test(name)) {
      setError("contactName", "nameError", "Names cannot contain numbers.");
      ok = false;
    } else {
      setValid("contactName");
      clearError("nameError");
    }

    const digitsOnly = phone.replace(/[^\d]/g, "");
    const phoneRegex = /^[+]?[\d\s()-]{7,20}$/;
    if (!phone) {
      setError("contactPhone", "phoneError", "Phone number is required.");
      ok = false;
    } else if (!phoneRegex.test(phone)) {
      setError("contactPhone", "phoneError", "Enter a valid phone (7–15 digits, optional +).");
      ok = false;
    } else if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      setError("contactPhone", "phoneError", "Phone must contain 7–15 digits.");
      ok = false;
    } else if (/[a-zA-Z]/.test(phone)) {
      setError("contactPhone", "phoneError", "Phone numbers cannot contain letters.");
      ok = false;
    } else {
      setValid("contactPhone");
      clearError("phoneError");
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRegex.test(email)) {
        setError("contactEmail", "emailError", "Enter a valid email address.");
        ok = false;
      } else {
        setValid("contactEmail");
        clearError("emailError");
      }
    } else {
      setValid("contactEmail");
      clearError("emailError");
    }

    if (address && address.length > 120) {
      setError("contactAddress", "addressError", "Address is too long (max 120).");
      ok = false;
    } else {
      setValid("contactAddress");
      clearError("addressError");
    }

    return ok;
  }

  function handleContactSubmit(e) {
    e.preventDefault();
    if (!validateContactForm()) {
      $("contactForm").classList.add("was-validated");
      return;
    }

    const data = {
      name: $("contactName").value.trim(),
      phone: $("contactPhone").value.trim(),
      email: $("contactEmail").value.trim(),
      address: $("contactAddress").value.trim(),
      group: $("contactGroup").value,
      notes: $("contactNotes").value.trim(),
      photo: pendingPhoto,
      isFavorite: $("contactFavorite").checked,
      isEmergency: $("contactEmergency").checked,
    };

    if (editingId) {
      const idx = contacts.findIndex((x) => x.id === editingId);
      if (idx === -1) return;
      contacts[idx] = { ...contacts[idx], ...data };
      if (!saveContacts()) return;
      renderAll();
      modalInstance.hide();
      Swal.fire({ icon: "success", title: "Contact updated", text: `${data.name} has been updated.`, timer: 1800, showConfirmButton: false, confirmButtonColor: "#3b5bdb" });
    } else {
      const newContact = { id: uid(), ...data };
      contacts.push(newContact);
      if (!saveContacts()) {
        contacts.pop();
        return;
      }
      renderAll();
      modalInstance.hide();
      Swal.fire({ icon: "success", title: "Contact added", text: `${data.name} has been saved.`, timer: 1800, showConfirmButton: false, confirmButtonColor: "#3b5bdb" });
    }
  }

  function deleteContact(id) {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    Swal.fire({
      icon: "warning",
      title: "Delete contact?",
      text: `Are you sure you want to delete "${c.name}"? This cannot be undone.`,
      showCancelButton: true,
      confirmButtonColor: "#e03131",
      cancelButtonColor: "#7a8194",
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
    }).then((res) => {
      if (res.isConfirmed) {
        contacts = contacts.filter((x) => x.id !== id);
        saveContacts();
        renderAll();
        Swal.fire({ icon: "success", title: "Contact deleted", text: `${c.name} has been removed.`, timer: 1800, showConfirmButton: false, confirmButtonColor: "#3b5bdb" });
      }
    });
  }

  function toggleFavorite(id) {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    c.isFavorite = !c.isFavorite;
    saveContacts();
    renderAll();
  }

  function toggleEmergency(id) {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    c.isEmergency = !c.isEmergency;
    saveContacts();
    renderAll();
  }

  function onGridClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (action === "favorite") toggleFavorite(id);
    else if (action === "edit") openEditContactModal(id);
    else if (action === "delete") deleteContact(id);
  }

  function init() {
    contacts = loadContacts();
    modalInstance = new bootstrap.Modal($("contactModal"));

    $("footerYear").textContent = new Date().getFullYear();

    $("btnAddContact").addEventListener("click", openAddContactModal);
    $("contactForm").addEventListener("submit", handleContactSubmit);
    $("contactPhoto").addEventListener("change", onPhotoSelected);
    $("btnRemovePhoto").addEventListener("click", () => {
      pendingPhoto = "";
      showPhotoPreview("");
      $("contactPhoto").value = "";
    });

    ["contactName", "contactPhone", "contactEmail", "contactAddress"].forEach((id) => {
      $(id).addEventListener("input", () => {
        const el = $(id);
        if (el.classList.contains("is-invalid")) {
          el.classList.remove("is-invalid");
        }
      });
    });

    searchInput.addEventListener("input", onSearchInput);
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      searchClear.classList.add("d-none");
      renderContacts();
      searchInput.focus();
    });

    [gridAll, gridFav, gridEmg].forEach((g) => g.addEventListener("click", onGridClick));

    $("contactModal").addEventListener("hidden.bs.modal", () => {
      editingId = null;
      pendingPhoto = "";
      resetForm();
    });

    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
