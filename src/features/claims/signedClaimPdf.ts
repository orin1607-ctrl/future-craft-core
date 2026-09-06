/**
 * Client-side signed opening-form PDF using canvas → JPEG → minimal PDF.
 * No new library, no new schema. Uploaded via existing claims-docs / claims-intake.
 */

function wrapJpegAsPdf(jpeg: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  const pageW = 595;
  const pageH = Math.max(200, Math.round((heightPx / widthPx) * pageW));
  const stream = jpeg;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const pushStr = (s: string) => chunks.push(encoder.encode(s));

  pushStr("%PDF-1.4\n");
  const off: number[] = [0];
  const pos = () => chunks.reduce((n, c) => n + c.length, 0);

  off.push(pos());
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  off.push(pos());
  pushStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  off.push(pos());
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  off.push(pos());
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${stream.length} >>\nstream\n`,
  );
  chunks.push(stream);
  pushStr("\nendstream\nendobj\n");
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  off.push(pos());
  pushStr(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  const xrefAt = pos();
  pushStr(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) {
    pushStr(`${String(off[i]).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

export async function buildSignedOpeningFormPdf(opts: {
  clientName: string;
  plate: string;
  eventDate: string;
  eventLocation: string;
  eventDesc: string;
  signaturePng: string;
}): Promise<File> {
  const W = 794;
  const H = 1123;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#111111";
  ctx.textAlign = "right";
  ctx.direction = "rtl";
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.fillText("טופס פתיחת תביעה — חתום", W - 40, 56);
  ctx.font = "16px Arial, sans-serif";
  const lines = [
    `שם לקוח: ${opts.clientName || "—"}`,
    `מספר רכב: ${opts.plate || "—"}`,
    `תאריך אירוע: ${opts.eventDate || "—"}`,
    `מקום האירוע: ${opts.eventLocation || "—"}`,
    `תיאור: ${opts.eventDesc || "—"}`,
  ];
  lines.forEach((t, i) => ctx.fillText(t, W - 40, 110 + i * 32));
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.fillText("חתימה:", W - 40, 300);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 360;
      const maxH = 160;
      const r = Math.min(maxW / img.width, maxH / img.height, 1);
      ctx.drawImage(img, W - 40 - img.width * r, 320, img.width * r, img.height * r);
      resolve();
    };
    img.onerror = () => reject(new Error("signature image"));
    img.src = opts.signaturePng;
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("jpeg"))), "image/jpeg", 0.82);
  });
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const pdf = wrapJpegAsPdf(jpeg, W, H);
  return new File([pdf], "טופס-פתיחת-תביעה-חתום.pdf", { type: "application/pdf" });
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
