// landing.js — the site's front door: what the system is, and a way into each page.
// Loads after forms/common.js for the stores.json loader and the fallback lists.

let STORES   = FALLBACK_DATA.stores;
let KITCHENS = FALLBACK_DATA.kitchens;

// The location <select> carries "<kind>:<id>" values so one dropdown can route to either
// form: a store opens the delivery form, a kitchen opens the production log.
const FORM_FOR = {
  store:   { page: 'taipei_delivery_form3.html',   param: 'store',   label: 'Open Delivery Form' },
  kitchen: { page: 'taipei_production_form3.html', param: 'kitchen', label: 'Open Production Log' }
};

function populateLocations() {
  const select = document.getElementById('location');
  while (select.options.length > 1) select.remove(1);

  const addGroup = (label, kind, entries, text) => {
    if (!entries.length) return;
    const group = document.createElement('optgroup');
    group.label = label;
    entries.forEach(entry => {
      const option = document.createElement('option');
      option.value = kind + ':' + entry.id;
      option.textContent = text(entry);
      group.appendChild(option);
    });
    select.appendChild(group);
  };

  addGroup('Stores', 'store', STORES, s => s.location ? `${s.name} · ${s.location}` : s.name);
  addGroup('Production Kitchens', 'kitchen', KITCHENS, k => k.name);
}

/** The selected location as { kind, id, entry }, or null when nothing is chosen. */
function selectedLocation() {
  const value = document.getElementById('location').value;
  if (!value) return null;
  const [kind, id] = value.split(':');
  const list = kind === 'store' ? STORES : KITCHENS;
  const entry = list.find(e => e.id === id);
  return entry ? { kind, id, entry } : null;
}

/** Where the Open button will go, or null when nothing is chosen. */
function targetUrl() {
  const chosen = selectedLocation();
  if (!chosen) return null;
  const form = FORM_FOR[chosen.kind];
  return `${form.page}?${form.param}=${encodeURIComponent(chosen.id)}`;
}

function handleLocationChange() {
  const chosen = selectedLocation();
  const btn    = document.getElementById('open-form-btn');
  const status = document.getElementById('location-status');
  if (!chosen) {
    btn.disabled = true;
    btn.textContent = 'Select a location';
    status.textContent = '';
    return;
  }
  btn.disabled = false;
  btn.textContent = FORM_FOR[chosen.kind].label;
  status.textContent = chosen.entry.name;
}

function openForm() {
  const url = targetUrl();
  if (url) window.location.href = url;
}

window.addEventListener('DOMContentLoaded', async () => {
  const data = await loadStoresData();
  STORES   = activeEntries(data, 'stores',   STORES);
  KITCHENS = activeEntries(data, 'kitchens', KITCHENS);
  populateLocations();
  handleLocationChange();
});
