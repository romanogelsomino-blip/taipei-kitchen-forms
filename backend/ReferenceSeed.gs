// ReferenceSeed.gs — the reference lists as they stood when the Reference sheet was
// introduced, transcribed from data/stores.json, data/drivers.json and data/supervisors.json.
//
// Read in exactly one situation: a reference tab that has just been created. It is the
// bootstrap for a brand-new environment, not a source of truth, and it never overwrites a
// tab that already has a header row. After the first deploy the sheet is authoritative.
//
// A function returning a literal, not a top-level const: file load order is not guaranteed.
// sortOrder is the array position; `active` defaults to true.

function referenceSeed() {
  return {
    kitchens: [
      { id: 'legacy-park', name: 'Legacy Park' },
      { id: '6112',        name: 'Store 6112' },
      { id: 'other',       name: 'Other' }
    ],
    supervisors: [
      { id: 'anna',  name: 'Anna' },
      { id: 'lucia', name: 'Lucia' },
      { id: 'jiang', name: 'Jiang' },
      { id: 'guy',   name: 'Guy' }
    ],
    dishes: [
      { id: 'gen-tso',          name: 'General Tso Chicken Bento' },
      { id: 'sesame',           name: 'Sesame Chicken Bento' },
      { id: 'lo-mein-chicken',  name: 'Bento Chicken Lo Mein' },
      { id: 'lo-mein-shrimp',   name: 'Bento Shrimp Lo Mein' },
      { id: 'lo-mein-pork',     name: 'Bento Smoked Pork Lo Mein' },
      { id: 'sweet-sour',       name: 'Bento Sweet & Sour Chicken' },
      { id: 'bourbon',          name: 'Bourbon Chicken Bento' },
      { id: 'broccoli',         name: 'Broccoli Chicken Bento' },
      { id: 'hot-spicy',        name: 'Hot Spicy Chicken Bento' },
      { id: 'dumplings',        name: 'Bento Steamed Dumplings' },
      { id: 'egg-roll-chicken', name: 'Chicken Egg Roll' },
      { id: 'egg-roll-pork',    name: 'Pork Egg Roll' },
      { id: 'egg-roll-shrimp',  name: 'Shrimp Egg Roll' }
    ],
    stores: [
      { id: '0000', name: '(reserved) CI smoke test', location: '', active: false },   // the dev deploy writes smoke rows here; reserved in both environments
      { id: '6006', name: 'Store 6006', location: 'Kline Village, Harrisburg, PA' },
      { id: '6061', name: 'Store 6061', location: 'Shippensburg, PA' },
      { id: '6112', name: 'Store 6112', location: '255 S Spring Garden St, Carlisle, PA' },
      { id: '6253', name: 'Store 6253', location: 'New Cumberland, PA' },
      { id: '6331', name: 'Store 6331', location: 'Mechanicsburg, PA' },
      { id: '6443', name: 'Store 6443', location: 'Chambersburg, PA' },
      { id: '6542', name: 'Store 6542', location: 'Carlisle, PA' },
      { id: '6564', name: 'Store 6564', location: 'Harrisburg (Gayson Rd), PA' }
    ],
    drivers: [
      { id: 'owen',           name: 'Owen' },
      { id: 'sam-blumenthal', name: 'Sam Blumenthal' },
      { id: 'andy',           name: 'Andy' }
    ]
  };
}
