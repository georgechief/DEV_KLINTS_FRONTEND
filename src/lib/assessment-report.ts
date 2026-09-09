import { apiRequest, apiRequestBlob } from "@/lib/api";

export type AssessmentReportComposeBody = {
  since: string;
  until: string;
  /** Polished overview brief profile — use via downloadOverviewBrief on Export surfaces. */
  report_profile?: "overview_brief";
};

export type AssessmentReportMetadata = {
  report_id: string;
  status: string;
  variant: string;
  payload_hash: string;
  template_version: string;
  report_profile?: string | null;
  created_at?: string;
};

const DEFAULT_PDF_FILENAME = "klints-assessment.pdf";

export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      return utf8[1].trim();
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

export function sanitizePdfFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/\.+$/, "");
  const base = cleaned || DEFAULT_PDF_FILENAME;
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

function fallbackPdfFilename(report: AssessmentReportMetadata): string {
  const day = report.created_at?.slice(0, 10);
  return day ? `klints-assessment-${day}.pdf` : DEFAULT_PDF_FILENAME;
}

export function assessmentReportErrorMessage(error: unknown): string {
  if (
    error instanceof TypeError ||
    (error instanceof Error && /failed to fetch|networkerror/i.test(error.message))
  ) {
    return "Network error. Try again in a moment.";
  }
  if (error && typeof error === "object") {
    const rec = error as { detail?: unknown; code?: unknown; status?: unknown };
    if (typeof rec.detail === "string" && rec.detail.trim()) {
      return rec.detail;
    }
    if (rec.status === 403) {
      return "You do not have permission to export the assessment report.";
    }
    if (rec.status === 409) {
      return "Report is not ready to render.";
    }
  }
  return "Could not export the assessment brief.";
}

export async function composeAssessmentReport(
  body: AssessmentReportComposeBody,
): Promise<AssessmentReportMetadata> {
  return apiRequest("/api/v1/assessment-reports/", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<AssessmentReportMetadata>;
}

async function assertPdfBlob(blob: Blob): Promise<void> {
  if (blob.size < 5) {
    throw { detail: "Could not export the assessment brief.", status: 500 };
  }
  const magic = await blob.slice(0, 5).text();
  if (!magic.startsWith("%PDF")) {
    throw { detail: "Could not export the assessment brief.", status: 500 };
  }
}

export async function fetchAssessmentReportPdf(reportId: string): Promise<{
  blob: Blob;
  filename: string | null;
}> {
  const { blob, contentDisposition } = await apiRequestBlob(
    `/api/v1/assessment-reports/${reportId}/pdf/`,
  );
  await assertPdfBlob(blob);
  return {
    blob,
    filename: filenameFromContentDisposition(contentDisposition),
  };
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizePdfFilename(filename);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Compose + PDF for Overview Export brief (polished overview_brief profile). */
export async function downloadOverviewBrief(body: {
  since: string;
  until: string;
}): Promise<void> {
  const report = await composeAssessmentReport({
    ...body,
    report_profile: "overview_brief",
  });
  if (!report.report_id) {
    throw { detail: "Compose did not return a report id.", status: 500 };
  }
  const { blob, filename } = await fetchAssessmentReportPdf(report.report_id);
  triggerBrowserDownload(blob, filename ?? fallbackPdfFilename(report));
}
