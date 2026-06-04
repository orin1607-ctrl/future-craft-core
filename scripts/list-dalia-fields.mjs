import { readFileSync } from 'fs';
const t =
  readFileSync('src/components/vehicles/vehicleNewDalia/VehicleNewFormDalia.tsx', 'utf8') +
  readFileSync('src/components/vehicles/vehicleNewDalia/vehicleNewDaliaBlocks.tsx', 'utf8');
const names = [...t.matchAll(/name=["']([^"']+)["']/g)].map((m) => m[1]);
const uniq = [...new Set(names)].sort();
console.log('unique fields:', uniq.length);
uniq.forEach((n) => console.log(n));
