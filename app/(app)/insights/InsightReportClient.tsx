"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw, SquarePlay as Youtube } from "lucide-react";
import YoutubeInsightReport from "./YoutubeInsightReport";

type ApiEnvelope = { success?: boolean; message?: string; data?: unknown };
type ReportObject = Record<string, unknown>;

// Same-origin: the report API lives in this app now.
const API_BASE_URL = "";
const REPORT_STORAGE_KEY = "youtubeInsightReport";
const REPORT_ID_STORAGE_KEY = "youtubeInsightReportId";

function apiPath(path: string): string {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${base}/${cleanPath}`;
}

function isObject(value: unknown): value is ReportObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStoredToken(): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("adminToken") ||
    localStorage.getItem("accessToken") ||
    ""
  );
}

function extractReportFromPayload(payload: unknown): ReportObject | null {
  if (!isObject(payload)) return null;
  if (isObject(payload.frontendReport)) return payload.frontendReport;
  if (isObject(payload.dashboard)) return payload.dashboard;
  if (isObject(payload.report)) return extractReportFromPayload(payload.report);
  if (isObject(payload.data)) return extractReportFromPayload(payload.data);
  return payload;
}

function extractReportId(payload: unknown): string {
  if (!isObject(payload)) return "";
  const directId = payload.reportId || payload._id || payload.id;
  if (typeof directId === "string") return directId;
  if (isObject(payload.data)) return extractReportId(payload.data);
  if (isObject(payload.frontendReport)) return extractReportId(payload.frontendReport);
  if (isObject(payload.dashboard)) return extractReportId(payload.dashboard);
  if (isObject(payload.report)) return extractReportId(payload.report);
  return "";
}

function getErrorMessage(value: unknown, fallback: string): string {
  if (!isObject(value)) return fallback;
  return typeof value.message === "string" && value.message.trim() ? value.message : fallback;
}

export default function YoutubeInsightReportPage(): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const reportIdFromUrl = useMemo(
    () => searchParams.get("reportId") || searchParams.get("id") || "",
    [searchParams]
  );
  const shareTokenFromUrl = useMemo(
    () => searchParams.get("share") || searchParams.get("token") || "",
    [searchParams]
  );

  const isShareableView = Boolean(shareTokenFromUrl);

  const brandModeFromUrl = useMemo(() => {
    const mode = String(
      searchParams.get("brandMode") ||
      searchParams.get("mode") ||
      ""
    )
      .trim()
      .toLowerCase();

    return mode === "brand" || mode === "true" || mode === "1";
  }, [searchParams]);

  const isBrandMode =
    Boolean(pathname?.startsWith("/brand/")) || brandModeFromUrl;

  const [report, setReport] = useState<ReportObject | null>(null);
  const [reportId, setReportId] = useState<string>(reportIdFromUrl);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const saveReport = useCallback((payload: unknown, options?: { skipSession?: boolean }): ReportObject | null => {
    const extractedReport = extractReportFromPayload(payload);
    const extractedReportId = extractReportId(payload);

    if (extractedReport) {
      if (!options?.skipSession) {
        sessionStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(extractedReport));
      }
      setReport(extractedReport);
    }

    if (extractedReportId) {
      if (!options?.skipSession) {
        sessionStorage.setItem(REPORT_ID_STORAGE_KEY, extractedReportId);
      }
      setReportId(extractedReportId);
    }

    return extractedReport;
  }, []);

  const fetchReportById = useCallback(
    async (id: string, options?: { silent?: boolean }): Promise<void> => {
      if (!id) return;

      try {
        if (options?.silent) setRefreshing(true);
        else setLoading(true);
        setError("");

        const token = getStoredToken();
        const response = await fetch(apiPath(`/api/insights/${id}`), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const result = (await response.json()) as ApiEnvelope;
        if (!response.ok || result.success === false) {
          throw new Error(result.message || "Failed to fetch YouTube insight report.");
        }

        const extractedReport = saveReport(result.data);
        if (!extractedReport) throw new Error("Report data is missing from backend response.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong while loading the report.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [saveReport]
  );

  const refreshReportById = useCallback(
    async (id: string): Promise<void> => {
      if (!id) return;

      try {
        setRefreshing(true);
        setError("");

        const token = getStoredToken();

        const response = await fetch(apiPath(`/api/insights/${id}/refresh`), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const result = (await response.json()) as ApiEnvelope;

        if (!response.ok || result.success === false) {
          throw new Error(result.message || "Failed to refresh YouTube insight report.");
        }

        sessionStorage.removeItem(REPORT_STORAGE_KEY);

        const extractedReport = saveReport(result.data);
        if (!extractedReport) {
          throw new Error("Refreshed report data is missing from backend response.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong while refreshing the report.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [saveReport]
  );

  const fetchPublicReportByToken = useCallback(
    async (token: string, options?: { silent?: boolean }): Promise<void> => {
      if (!token) return;

      try {
        if (options?.silent) setRefreshing(true);
        else setLoading(true);
        setError("");

        const response = await fetch(apiPath(`/api/insights/public/${encodeURIComponent(token)}`), {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        const result = (await response.json()) as ApiEnvelope;
        if (!response.ok || result.success === false) {
          throw new Error(result.message || "This public insight report link is invalid or expired.");
        }

        const extractedReport = saveReport(result.data, { skipSession: true });
        if (!extractedReport) throw new Error("Public report data is missing from backend response.");
      } catch (err) {
        setReport(null);
        setError(err instanceof Error ? err.message : "Something went wrong while loading the shared report.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [saveReport]
  );

  useEffect(() => {
    const loadReport = async (): Promise<void> => {
      try {
        setLoading(true);
        setError("");

        if (shareTokenFromUrl) {
          sessionStorage.removeItem(REPORT_STORAGE_KEY);
          sessionStorage.removeItem(REPORT_ID_STORAGE_KEY);
          await fetchPublicReportByToken(shareTokenFromUrl);
          return;
        }

        const storedReportId = sessionStorage.getItem(REPORT_ID_STORAGE_KEY) || "";
        const usableReportId = reportIdFromUrl || storedReportId;
        if (usableReportId) setReportId(usableReportId);

        const storedReport = sessionStorage.getItem(REPORT_STORAGE_KEY);
        if (storedReport) {
          const parsed = JSON.parse(storedReport) as unknown;
          const extracted = extractReportFromPayload(parsed);
          if (extracted) {
            setReport(extracted);
            setLoading(false);
            if (usableReportId) void fetchReportById(usableReportId, { silent: true });
            return;
          }
          sessionStorage.removeItem(REPORT_STORAGE_KEY);
        }

        if (usableReportId) {
          await fetchReportById(usableReportId);
          return;
        }

        setLoading(false);
      } catch {
        sessionStorage.removeItem(REPORT_STORAGE_KEY);
        setError("Saved report data is invalid. Please analyze the video again.");
        setLoading(false);
      }
    };

    void loadReport();
  }, [fetchPublicReportByToken, fetchReportById, reportIdFromUrl, shareTokenFromUrl]);

  const handleBackToAnalyze = (): void => {
    if (shareTokenFromUrl) {
      router.push("/insights");
      return;
    }
    router.back();
  };

  const handleRefresh = (): void => {
    if (shareTokenFromUrl) {
      void fetchPublicReportByToken(shareTokenFromUrl, { silent: true });
      return;
    }

    if (!reportId) {
      setError("Report ID is not available. Please analyze the video again.");
      return;
    }
    void refreshReportById(reportId);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <h1 className="mt-5 text-xl font-bold text-slate-950">Loading YouTube Insight</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Please wait while we prepare the report.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Youtube className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-slate-950">No report found</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {shareTokenFromUrl ? "This shared report link could not be loaded." : "Please analyze a YouTube video link first."}
          </p>
          {error ? <div className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}
          <button type="button" onClick={handleBackToAnalyze} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
            {shareTokenFromUrl ? "Go to Insight OS" : "Analyze Video"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-6 py-3">
          <button type="button" onClick={handleBackToAnalyze} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            {shareTokenFromUrl ? "Go to Insight OS" : "Back to Analyze"}
          </button>
          <div className="flex items-center gap-2">
            {error ? <span className="hidden max-w-md truncate text-xs text-red-500 md:inline">{error}</span> : null}
            {!isShareableView ? (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || !reportId}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <YoutubeInsightReport
        report={report}
        reportId={reportId}
        shareToken={shareTokenFromUrl}
        isShareableView={isShareableView}
        isBrandMode={isBrandMode}
      />
    </main>
  );
}
