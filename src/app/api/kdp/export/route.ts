import ExcelJS from "exceljs";

import { auth } from "@/auth";
import { accountLabel } from "@/lib/kdp";
import { payoutSchedule } from "@/lib/kdp-finance";
import { getFiscalRows, getMonthlyRoyalties } from "@/server/queries/kdp-finance";

/** Yearly sales workbook for the accountant: per month, account and marketplace, EUR. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Non autorizzato" }, { status: 401 });

  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: "Anno non valido" }, { status: 400 });
  }
  const [rows, monthly] = await Promise.all([getFiscalRows(year), getMonthlyRoyalties()]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RDL Productivity";
  const euro = '#,##0.00 "€"';

  const detail = workbook.addWorksheet("Dettaglio");
  detail.columns = [
    { header: "Mese", key: "month", width: 10 },
    { header: "Account", key: "account", width: 20 },
    { header: "Mercato", key: "marketplace", width: 16 },
    { header: "Copie eBook", key: "ebookUnits", width: 12 },
    { header: "Copie cartaceo", key: "paperbackUnits", width: 14 },
    { header: "Copie rigida", key: "hardcoverUnits", width: 12 },
    { header: "Pagine KENP", key: "kenp", width: 12 },
    { header: "Royalty eBook", key: "royaltyEbook", width: 14, style: { numFmt: euro } },
    { header: "Royalty cartaceo", key: "royaltyPaperback", width: 16, style: { numFmt: euro } },
    { header: "Royalty rigida", key: "royaltyHardcover", width: 14, style: { numFmt: euro } },
    { header: "Royalty KENP", key: "royaltyKenp", width: 14, style: { numFmt: euro } },
    { header: "Royalty totale", key: "royalty", width: 14, style: { numFmt: euro } },
  ];
  for (const row of rows) detail.addRow({ ...row, account: accountLabel(row.account) });
  detail.getRow(1).font = { bold: true };
  detail.views = [{ state: "frozen", ySplit: 1 }];

  const summary = workbook.addWorksheet("Per mese");
  summary.columns = [
    { header: "Mese", key: "month", width: 10 },
    { header: "Account", key: "account", width: 20 },
    { header: "Copie", key: "units", width: 10 },
    { header: "Pagine KENP", key: "kenp", width: 12 },
    { header: "Royalty", key: "royalty", width: 14, style: { numFmt: euro } },
    { header: "Pagamento atteso", key: "payDate", width: 18 },
  ];
  const byMonth = new Map<string, { units: number; kenp: number; royalty: number }>();
  for (const row of rows) {
    const key = `${row.month}|${row.account}`;
    const entry = byMonth.get(key) ?? { units: 0, kenp: 0, royalty: 0 };
    entry.units += row.ebookUnits + row.paperbackUnits + row.hardcoverUnits;
    entry.kenp += row.kenp;
    entry.royalty += row.royalty;
    byMonth.set(key, entry);
  }
  const payDates = new Map(
    payoutSchedule(monthly, "9999-12-31").map((p) => [`${p.month}|${p.account}`, p.payDate]),
  );
  for (const [key, entry] of [...byMonth].sort()) {
    const [month, account] = key.split("|");
    summary.addRow({
      month,
      account: accountLabel(account as "main" | "secondary"),
      ...entry,
      payDate: payDates.get(key) ?? "",
    });
  }
  const total = [...byMonth.values()].reduce((sum, e) => sum + e.royalty, 0);
  summary.addRow({ month: "Totale", royalty: total }).font = { bold: true };
  summary.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="vendite-kdp-${year}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
