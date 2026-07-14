"use server";

import { revalidatePath } from "next/cache";
import { getApi } from "@/lib/api";

export type UpdateReportState = {
  ok: boolean;
  error?: string;
};

/**
 * Valid transition targets for AdminUpdatePostReportStatus (feed-service
 * domain.ReportStatus.IsValidTransitionTarget): "pending" is deliberately
 * excluded there — a report cannot be walked back to untouched once staff
 * has acted on it — so it is not offered here either.
 */
export type ReportStatusTarget = "reviewing" | "resolved" | "dismissed";

/**
 * Server action backing the #09 resolve controls. Only `status` goes in the
 * request body — `UpdateReportStatusRequestBody` in openapi.d.ts has no
 * `resolved_by` field. The BFF handler (ops_handler_new.go
 * UpdateReportStatus) derives the staff identity itself from the Cloudflare
 * Access JWT (humaauth.GetIdentity(ctx).Email) and passes that to feed-service
 * as ResolvedBy — fabricating a value here would be redundant at best and
 * wrong at worst, since the server does not read one from us.
 */
export async function updateReportStatusAction(
  reportId: string,
  status: ReportStatusTarget
): Promise<UpdateReportState> {
  const api = await getApi();
  const { error } = await api.PATCH("/v1/ops/reports/{report_id}", {
    params: { path: { report_id: reportId } },
    body: { status },
  });

  if (error) {
    return { ok: false, error: error.detail || error.title || "Falha ao atualizar a denúncia." };
  }

  revalidatePath("/denuncias");
  return { ok: true };
}
