import { useState, type ReactNode } from "react";
import { useNotice } from "../../components/Notice";
import { loadingState } from "../../components/ui";
import { useFactories, useItems, useOrderItems, useOrders, useOrganizations } from "../../data/queries";
import { downloadSheet } from "../../lib/spreadsheet";
import { messageOf } from "../../lib/supabase";
import { useUiState } from "../../lib/uiState";
import { REPORTS, reportCells, type FilterValues, type Report, type ReportData } from "./reports";

export function ReportsPage() {
  const orders = useOrders();
  const organizations = useOrganizations();
  const factories = useFactories();
  const orderItems = useOrderItems();
  const items = useItems();
  const waiting = loadingState([orders, organizations, factories, orderItems, items]);
  const data: ReportData | null = waiting
    ? null
    : { orders: orders.data!, organizations: organizations.data!, factories: factories.data!, orderItems: orderItems.data!, items: items.data! };

  return (
    <>
      <div className="page-head">
        <div className="title-block">
          <h1>Reports</h1>
          <p className="muted">Choose filters, then download the matching data as an Excel spreadsheet.</p>
        </div>
      </div>
      <div className="stack">
        {REPORTS.map((report) => (
          <ReportCard key={report.id} report={report} data={data} waiting={waiting} />
        ))}
      </div>
    </>
  );
}

function ReportCard({ report, data, waiting }: { report: Report; data: ReportData | null; waiting: ReactNode }) {
  const { notify } = useNotice();
  // Report id -> { filter name: value }; kept while moving between pages.
  const [allFilters, setAllFilters] = useUiState<Record<string, FilterValues>>("reportFilters", {});
  const [busy, setBusy] = useState(false);
  const values = allFilters[report.id] ?? {};
  const setValue = (name: string, value: string) => setAllFilters((all) => ({ ...all, [report.id]: { ...all[report.id], [name]: value } }));
  const n = data ? report.records(values, data).length : 0;

  async function download() {
    if (!data) return;
    setBusy(true);
    try {
      const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
      await downloadSheet(
        `${report.fileName}-${today}.xlsx`,
        report.title,
        report.columns.map(([heading, , width]) => [heading, width]),
        reportCells(report, values, data),
      );
    } catch (error) {
      notify("error", `Couldn't create the ${report.title.toLowerCase()}: ${messageOf(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card section">
      <h2>{report.title}</h2>
      <p className="muted report-description">{report.description}</p>
      {waiting ?? (
        <form className="report-filters" onSubmit={(e) => e.preventDefault()}>
          {report.filters(data!).map((f) => (
            <label key={f.name}>
              {f.label}
              {f.type === "date" ? (
                <input type="date" name={f.name} value={values[f.name] ?? ""} onChange={(e) => setValue(f.name, e.target.value)} />
              ) : f.type === "search" ? (
                <>
                  <input
                    type="search"
                    name={f.name}
                    value={values[f.name] ?? ""}
                    placeholder={f.placeholder}
                    autoComplete="off"
                    list={`${report.id}-${f.name}-options`}
                    onChange={(e) => setValue(f.name, e.target.value)}
                  />
                  <datalist id={`${report.id}-${f.name}-options`}>
                    {f.suggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </>
              ) : (
                <select name={f.name} value={values[f.name] ?? ""} onChange={(e) => setValue(f.name, e.target.value)}>
                  {f.options.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </form>
      )}
      <div className="report-actions">
        <button type="button" className="primary" disabled={!n || busy} onClick={download}>
          Download Excel
        </button>
        <span className="muted small">{data ? (n === 1 ? `1 ${report.noun[0]} matches` : `${n} ${report.noun[1]} match`) : "Loading…"}</span>
      </div>
    </section>
  );
}
