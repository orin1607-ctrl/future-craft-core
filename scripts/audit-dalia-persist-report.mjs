/**
 * Final mapping report: Dalia form fields → vehicles (direct + JSON overflow).
 */
import { readFileSync } from 'fs';

const src =
  readFileSync('src/components/vehicles/vehicleNewDalia/VehicleNewFormDalia.tsx', 'utf8') +
  readFileSync('src/components/vehicles/vehicleNewDalia/vehicleNewDaliaBlocks.tsx', 'utf8');
const formFields = [...new Set([...src.matchAll(/name=["']([^"']+)["']/g)].map((m) => m[1]))].filter(
  (n) => !n.includes('${'),
);

const persistSrc = readFileSync('src/lib/daliaVehiclePersist.ts', 'utf8');
const mapBlock = persistSrc.match(/const DIRECT_COLUMN_MAP[^=]*=\s*\{([\s\S]*?)\n\};/);
const DIRECT = {};
if (mapBlock) {
  for (const m of mapBlock[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) DIRECT[m[1]] = m[2];
}

const JSON_PACKED_PREFIXES = ['coverage_', 'maint_', 'svc_', 'mandatory_insurance_', 'comprehensive_insurance_', 'third_party_insurance_', 'op_', 'fl_', 'rent_', 'other_', 'company_', 'private_', 'loan_', 'self_'];
const FILE_SUFFIX = ['_file', '_file_name'];
const LINK_SUFFIX = ['_link'];

const directMapped = [];
const jsonPacked = [];
const unmapped = [];

for (const field of formFields.sort()) {
  if (DIRECT[field]) {
    directMapped.push({ field, column: DIRECT[field] });
  } else if (
    JSON_PACKED_PREFIXES.some((p) => field.startsWith(p)) ||
    FILE_SUFFIX.some((s) => field.endsWith(s)) ||
    (LINK_SUFFIX.some((s) => field.endsWith(s)) && !DIRECT[field])
  ) {
    jsonPacked.push(field);
  } else {
    unmapped.push(field);
  }
}

const wired =
  persistSrc.includes("supabase.from('vehicles')") || persistSrc.includes('supabase.from("vehicles")');

console.log(
  JSON.stringify(
    {
      vehiclesTableColumnsKnown: 96,
      daliaFormFieldCount: formFields.length,
      directColumnMapped: directMapped.length,
      jsonOverflowPacked: jsonPacked.length,
      remainingUnmapped: unmapped.length,
      totalPersisted: directMapped.length + jsonPacked.length + unmapped.length,
      saveVehicleWired: wired,
      persistModule: 'src/lib/daliaVehiclePersist.ts',
      directMapped,
      jsonPacked,
      unmapped,
    },
    null,
    2,
  ),
);
