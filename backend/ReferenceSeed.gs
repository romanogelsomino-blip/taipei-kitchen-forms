// ReferenceSeed.gs — the reference lists a brand-new environment starts from.
//
// Read in exactly one situation: a reference tab that has just been created. It is the
// bootstrap for a brand-new environment, not a source of truth, and it never overwrites a
// tab that already has a header row. After the first deploy the sheet is authoritative.
//
// A function returning a literal, not a top-level const: file load order is not guaranteed.
// The UUIDs are fixed so every environment seeds the same keys. sortOrder is the array
// position; a dish's `active` defaults to true, `verified` to true, and `deletedAt` to empty.

function referenceSeed() {
  return {
    kitchens: [
      { id: '1dd4b698-bc21-4b45-8a33-34112a681d66', kitchenType: 'Taipei', kitchenId: 'legacy-park', name: 'Legacy Park',   location: '100 Legacy Park Dr, Mechanicsburg, PA' },
      { id: '33930e11-89fa-447f-9781-e3ffe8f63c2f', kitchenType: 'Giant',  kitchenId: '6112',        name: 'Spring Garden', location: '255 S Spring Garden St, Carlisle, PA' }
    ],

    stores: [
      { id: '3053ab5e-a4ac-4450-9dfe-7cff7eefc73c', storeType: 'Giant', storeId: '6006', name: 'Kline Village', location: '136 Kline Village, Harrisburg, PA' },
      { id: 'f37cb8e5-0671-47fb-8eea-dc2debf6d3e0', storeType: 'Giant', storeId: '6061', name: 'Store 6061',    location: '397 Baltimore Rd, Shippensburg, PA' },
      { id: 'd55afaf3-8a4b-4205-98c9-eb6faef04a5e', storeType: 'Giant', storeId: '6112', name: 'Store 6112',    location: '255 S Spring Garden St, Carlisle, PA' },
      { id: '248e6d7c-1d32-4005-9fc1-f36c8d1e63e0', storeType: 'Giant', storeId: '6253', name: 'Store 6253',    location: '130 Old York Rd, New Cumberland, PA' },
      { id: 'd79ca4dc-d20f-4e08-abd1-f191a6ebf1fb', storeType: 'Giant', storeId: '6331', name: 'Store 6331',    location: 'Mechanicsburg, PA' },
      { id: '68448510-c119-4be6-82c1-10ddc8899ae7', storeType: 'Giant', storeId: '6443', name: 'Store 6443',    location: 'Chambersburg, PA' },
      { id: '42d6e005-07c1-4730-98bd-3186f3bf13f4', storeType: 'Giant', storeId: '6542', name: 'Store 6542',    location: 'Carlisle, PA' },
      { id: '8e260391-34e1-4516-a9aa-e645aafac9a8', storeType: 'Giant', storeId: '6564', name: 'Store 6564',    location: 'Harrisburg (Gayson Rd), PA' }
    ],

    dishes: [
      { id: 'c727a826-a4db-4a49-87d2-5c6615f44585', upc: '00024575600000', name: 'General Tso Chicken Bento' },
      { id: '0aec557c-dad3-4cff-ba6c-fc6b1cb72c02', upc: '00024576100000', name: 'Sesame Chicken Bento' },
      { id: '903ec8bc-2403-40a5-a8ae-3703c356d2eb', upc: '00022738800000', name: 'Bento Chicken Lo Mein' },
      { id: '31615832-5a84-493c-8c6d-bccd5eb012a2', upc: '00022735200000', name: 'Bento Shrimp Lo Mein' },
      { id: 'cb2956b6-2473-4ed4-ad01-23c7d547b885', upc: '00022738900000', name: 'Bento Smoked Pork Lo Mein' },
      { id: '47cf003e-8adf-4ebd-96b6-c4e7725e25c0', upc: '00022739100000', name: 'Bento Sweet & Sour Chicken' },
      { id: 'ceae862e-fcca-4675-82f1-063cc1461909', upc: '00024576200000', name: 'Bourbon Chicken Bento' },
      { id: 'b6b3fc4e-3a98-42e0-a611-a419e24b4982', upc: '00024575700000', name: 'Broccoli Chicken Bento' },
      { id: '5867486a-86fc-492a-aca9-1bf2ad9c293e', upc: '00024576500000', name: 'Hot Spicy Chicken Bento' },
      { id: '5032e4e0-4a75-42e0-bd10-d07fec0147b1', upc: '00022739600000', name: 'Bento Steamed Dumplings' },
      { id: '12cdd609-0548-413e-8503-7c6730ef8712', upc: '00024576900000', name: 'Chicken Egg Roll' },
      { id: '3376d14c-b3b2-450d-b63e-074fa34ac2e4', upc: '00024577100000', name: 'Pork Egg Roll' },
      { id: 'f48bebe2-0e28-42f7-a1cc-1163022b2ee0', upc: '00024577200000', name: 'Shrimp Egg Roll' },
      { id: '00000000-0000-4000-8000-000000000001', upc: '00000000000000', name: 'NON-TAIPEI DISH', active: false, deletedAt: '2026-10-24T00:00:00-04:00', reserved: true }   // where a sales row whose UPC no dish has is filed; never cooked, never offered
    ],

    cooks: [
      { id: 'b366fa0e-7576-4945-8b62-d10f1a3e4cdb', name: 'Anna' },
      { id: 'a588d0fb-6fb1-480c-bf66-99ecae07125c', name: 'Lucia' },
      { id: 'bf6ca106-a9b8-4e13-b7f5-e0c959add56b', name: 'Jiang' }
    ],

    drivers: [
      { id: 'e967dcb5-77ba-41b6-a8ac-db46806230e7', name: 'Owen', deletedAt: '2026-10-28T16:35:34-04:00' },
      { id: '0b32d496-b2b5-4dc2-b68e-ba28a8e911b9', name: 'Sam Blumenthal' },
      { id: '179fe668-826d-4fa3-abcd-130194eefdf4', name: 'Andy' },
      { id: '89f56d14-d476-42fa-8017-f4405a78a106', name: 'Dave Ramirez' }
    ],

    supervisors: [
      { id: '4b1b2e17-4a9f-423e-9c48-d749452be887', name: 'Romano Gelsomino' },
      { id: 'f75404de-c203-4992-bad9-dc83f19891d5', name: 'Sam Blumenthal' }
    ]
  };
}
