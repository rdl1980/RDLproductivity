import ExcelJS from "exceljs";

import { auth } from "@/auth";
import { accountLabel, KDP_ACCOUNT_VALUES, todayIn } from "@/lib/kdp";
import { yearTransfers } from "@/lib/kdp-finance";
import { marketplaceLabel } from "@/lib/kdp-sales";
import { getPayouts } from "@/server/queries/kdp-finance";

const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

/** The KDP transfers of a calendar year (cash basis, for the tax return), per account. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Non autorizzato" }, { status: 401 });

  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: "Anno non valido" }, { status: 400 });
  }
  const byAccount = yearTransfers(await getPayouts(todayIn(TIME_ZONE)), year, KDP_ACCOUNT_VALUES);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RDL Productivity";
  const euro = '#,##0.00 "€"';

  const summary = workbook.addWorksheet("Totali per account");
  summary.columns = [
    { header: "Account", key: "account", width: 20 },
    { header: "Bonifici", key: "count", width: 10 },
    { header: "Ricevuti (stima)", key: "received", width: 18, style: { numFmt: euro } },
    { header: "Ancora da ricevere", key: "due", width: 18, style: { numFmt: euro } },
    { header: `Totale ${year}`, key: "total", width: 16, style: { numFmt: euro } },
  ];
  for (const a of byAccount) {
    summary.addRow({
      account: accountLabel(a.account),
      count: a.transfers.length,
      received: a.received,
      due: a.due,
      total: a.received + a.due,
    });
  }
  summary.addRow({
    account: "Totale",
    count: byAccount.reduce((n, a) => n + a.transfers.length, 0),
    received: byAccount.reduce((n, a) => n + a.received, 0),
    due: byAccount.reduce((n, a) => n + a.due, 0),
    total: byAccount.reduce((n, a) => n + a.received + a.due, 0),
  }).font = { bold: true };
  summary.getRow(1).font = { bold: true };
  summary.addRow({});
  summary.addRow({
    account:
      "Importi stimati in EUR dai report KDP: per le valute estere fa fede quanto arrivato in banca.",
  });

  const detail = workbook.addWorksheet("Bonifici");
  detail.columns = [
    { header: "Account", key: "account", width: 20 },
    { header: "Data pagamento", key: "payDate", width: 16 },
    { header: "Vendite del mese", key: "month", width: 16 },
    { header: "Mercato", key: "marketplace", width: 16 },
    { header: "Valuta", key: "currency", width: 8 },
    { header: "Importo stimato", key: "royalty", width: 16, style: { numFmt: euro } },
    { header: "Stato", key: "status", width: 12 },
  ];
  for (const a of byAccount) {
    for (const t of a.transfers) {
      detail.addRow({
        account: accountLabel(a.account),
        payDate: t.payDate,
        month: t.month,
        marketplace: marketplaceLabel(t.marketplace),
        currency: t.currency,
        royalty: t.royalty,
        status: t.status === "paid" ? "ricevuto" : "in arrivo",
      });
    }
  }
  detail.getRow(1).font = { bold: true };
  detail.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bonifici-kdp-${year}.xlsx"`,
    },
  });
}
