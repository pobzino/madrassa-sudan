// GET /api/admin/measurement/export?from&to&format=json|csv — the anonymised
// funder tables (approved admins only). One RPC (measurement_funder_export):
// no ids, names, question text or exact dates; groups under 5 children hidden,
// and a second cell where one hidden group could be worked out from a total.
// CSV: UTF-8 with a BOM, long format table_id,group,column,value,suppressed.

import type { FunderExport, FunderExportResponse } from "@/lib/measurement/types";
import { MIN_CELL_SIZE } from "@/lib/measurement/types";
import { mapMeasurementRpcError, measurementError, measurementJson, openSignedInRequest } from "@/lib/server/measurement/http";
import { funderExportCsv, parseExportQuery } from "@/lib/server/measurement/query";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const opened = await openSignedInRequest();
  if (!opened.ok) return opened.response;
  const { data: profile } = await opened.admin
    .from("profiles")
    .select("role, is_approved")
    .eq("id", opened.userId)
    .maybeSingle<{ role: string | null; is_approved: boolean | null }>();
  if (profile?.role !== "admin" || profile.is_approved !== true) return measurementError("impact_forbidden", 403);
  const parsed = parseExportQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return measurementError("invalid_query", 400);

  try {
    const { data, error } = await opened.admin.rpc("measurement_funder_export", {
      p_actor: opened.userId,
      p_from: parsed.from,
      p_to: parsed.to,
      p_min_cell: MIN_CELL_SIZE,
    });
    if (error || !data) return mapMeasurementRpcError(error);
    const report = data as FunderExport;
    if (parsed.format === "csv") {
      return new Response(funderExportCsv(report), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="amal-impact-${parsed.from}-${parsed.to}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return measurementJson({ export: report } satisfies FunderExportResponse);
  } catch (error) {
    console.error("Funder export failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
