"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
    ArrowUpRight,
    ChevronDown,
    ChevronsUpDown,
    FileText,
    Loader2,
    Users,
    X,
    SquarePlay as Youtube,
} from "lucide-react";
import axios from "./httpClient";

type ApiResponse = {
    success: boolean;
    message?: string;
    data?: unknown;
};

type PlainObject = Record<string, unknown>;

type InsightOsMode = "auto" | "public" | "brand";

type ApiListPayload = {
    success?: boolean;
    message?: string;
    data?: unknown;
    items?: unknown;
    pagination?: PaginationMeta;
    meta?: PaginationMeta;
};

type PaginationMeta = {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
};

type CampaignDeliverable = {
    id: string;
    title: string;
    platform: string;
    status: string;
    creatorName: string;
    url: string;
    dueDate: string;
    notes: string;
};

type CampaignCard = {
    id: string;
    campaignId: string;
    name: string;
    logo: string;
    logoBg: string;
    logoColor: string;
    status: "Active" | "Completed";
    statusColor: string;
    platforms: string[];
    liveLabel: string;
    liveCount: string;
    influencerCount: string;
    footer: string;
    description: string;
    budget: string;
    startDate: string;
    endDate: string;
    raw: PlainObject;
    deliverables: CampaignDeliverable[];
};

type PreviousSearchRow = {
    reportId: string;
    title: string;
    url: string;
    profile: string;
    engagement: string;
    engagementValue: number;
    aiScore: string;
    aiScoreValue: number;
    date: string;
    dateRaw: string;
    positive: boolean;
    thumbnailUrl: string;
    channelLogo: string;
};

type DateFilterKey = "all" | "7d" | "30d" | "90d";
type SortOrder = "asc" | "desc";
type PreviousSearchSortKey =
    | "createdAt"
    | "hero.influencerName"
    | "videoMetrics.engagementRate"
    | "aiScores.finalAiScore";

type StoredBrand = {
    _id?: string;
    id?: string;
    brandId?: string;
    brandName?: string;
    name?: string;
    data?: StoredBrand;
    brand?: StoredBrand;
};

const API_BASE_URL = "";

function apiPath(path: string): string {
    const base = API_BASE_URL.replace(/\/+$/, "");
    const cleanPath = path.replace(/^\/+/, "");
    return `${base}/${cleanPath}`;
}

const REPORT_STORAGE_KEY = "youtubeInsightReport";
const REPORT_ID_STORAGE_KEY = "youtubeInsightReportId";

const HERO_IMAGE_SRC = "/insight-os.png";
const AVATAR_STACK_SRC = "/Avatar-stack.png";
const AUDIENCE_CHART_SRC = "/Chart.png";
const COINS_CHART_SRC = "/Coins-Chart.png";
const HERO_WHITE_BLUR_SRC = "/hero-white-blur-mask.png";

const HERO_GRADIENT =
    "linear-gradient(109deg, var(--Neutrals-0, #FFF) 28.8%, #FAFAFA 36.05%, rgba(255, 191, 0, 0.83) 50%, #F6BB2A 57.65%, #F3584E 74.04%, #E078D1 84.62%), var(--Light-Background-Subtle, #F9F9F9)";

const DATE_FILTER_OPTIONS: { value: DateFilterKey; label: string }[] = [
    { value: "30d", label: "Last 30 days" },
    { value: "7d", label: "Last 7 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "all", label: "All time" },
];

const PREVIOUS_SEARCH_COLUMNS: { label: string; sortBy?: PreviousSearchSortKey }[] = [
    { label: "Creator Name", sortBy: "hero.influencerName" },
    { label: "Platform" },
    { label: "Profile", sortBy: "hero.influencerName" },
    { label: "Engagement", sortBy: "videoMetrics.engagementRate" },
    { label: "AI Score", sortBy: "aiScores.finalAiScore" },
    { label: "Publish Date", sortBy: "createdAt" },
];

function isObject(value: unknown): value is PlainObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractFrontendReport(payload: unknown): PlainObject | null {
    if (!isObject(payload)) return null;
    if (isObject(payload.frontendReport)) return payload.frontendReport;
    if (isObject(payload.dashboard)) return payload.dashboard;
    if (isObject(payload.data)) return extractFrontendReport(payload.data) || payload.data;
    return payload;
}

function extractReportId(payload: unknown): string {
    if (!isObject(payload)) return "";
    const directId = payload.reportId || payload._id || payload.id;
    if (typeof directId === "string") return directId;
    if (isObject(payload.data)) return extractReportId(payload.data);
    if (isObject(payload.frontendReport)) return extractReportId(payload.frontendReport);
    if (isObject(payload.dashboard)) return extractReportId(payload.dashboard);
    return "";
}

function getToken(): string {
    if (typeof window === "undefined") return "";
    return (
        localStorage.getItem("token") ||
        localStorage.getItem("adminToken") ||
        localStorage.getItem("accessToken") ||
        ""
    );
}

function getShowBrandOnlySections(pathname: string | null): boolean {
    if (!pathname) return false;
    return pathname.startsWith("/brand/insight-os") || (pathname.includes("/brand/") && pathname.includes("/insight-os"));
}



function getAuthHeaders(): Record<string, string> {
    const token = getToken();
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

function readStoredJson<T>(keys: string[]): T | null {
    if (typeof window === "undefined") return null;

    for (const key of keys) {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (!raw) continue;

        try {
            const parsed = JSON.parse(raw);
            if (isObject(parsed)) return parsed as T;
        } catch {
            // Ignore non-JSON storage values.
        }
    }

    return null;
}

function extractBrandFromValue(value: unknown): StoredBrand | null {
    if (!isObject(value)) return null;
    if (value._id || value.id || value.brandId) return value as StoredBrand;
    if (isObject(value.brand)) return extractBrandFromValue(value.brand);
    if (isObject(value.data)) return extractBrandFromValue(value.data);
    return null;
}

function getStoredBrand(): StoredBrand | null {
    const stored = readStoredJson<StoredBrand>([
        "brand",
        "brandData",
        "authBrand",
        "currentBrand",
        "brandDetails",
        "user",
        "userData",
        "authUser",
    ]);

    return extractBrandFromValue(stored);
}

function getStoredBrandId(): string {
    if (typeof window === "undefined") return "";
    const brand = getStoredBrand();

    return String(
        brand?._id ||
        brand?.brandId ||
        brand?.id ||
        localStorage.getItem("brandId") ||
        sessionStorage.getItem("brandId") ||
        ""
    ).trim();
}

function getStoredBrandName(): string {
    if (typeof window === "undefined") return "";
    const brand = getStoredBrand();

    return String(
        brand?.brandName ||
        brand?.name ||
        localStorage.getItem("brandName") ||
        sessionStorage.getItem("brandName") ||
        ""
    ).trim();
}

function formatCount(value: unknown): string {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number <= 0) return "0";

    return new Intl.NumberFormat("en", {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(number);
}

function formatDate(value: unknown): string {
    if (!value) return "—";

    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function getDateFilterParams(filter: DateFilterKey): { fromDate?: string; toDate?: string } {
    if (filter === "all") return {};

    const days = filter === "7d" ? 7 : filter === "90d" ? 90 : 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const to = new Date();
    to.setHours(23, 59, 59, 999);

    return { fromDate: from.toISOString(), toDate: to.toISOString() };
}

function getDateFilterLabel(filter: DateFilterKey): string {
    return DATE_FILTER_OPTIONS.find((item) => item.value === filter)?.label || "Last 30 days";
}

function getCampaignInitialLimit(width: number): number {
    if (width >= 1024) return 3;
    if (width >= 640) return 2;
    return 1;
}

function useCampaignInitialLimit(): number {
    const [limit, setLimit] = useState<number>(3);

    useEffect(() => {
        const updateLimit = (): void => setLimit(getCampaignInitialLimit(window.innerWidth));
        updateLimit();
        window.addEventListener("resize", updateLimit);
        return () => window.removeEventListener("resize", updateLimit);
    }, []);

    return limit;
}

function shorten(value: unknown, max = 28): string {
    const text = String(value || "").trim();
    if (!text) return "—";
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

function normalizeItems(payload: unknown): PlainObject[] {
    if (Array.isArray(payload)) return payload.filter(isObject);
    if (!isObject(payload)) return [];
    if (Array.isArray(payload.items)) return payload.items.filter(isObject);
    if (Array.isArray(payload.data)) return payload.data.filter(isObject);
    if (isObject(payload.data)) return normalizeItems(payload.data);
    return [];
}

function normalizePagination(payload: unknown): PaginationMeta {
    if (!isObject(payload)) return {};
    if (isObject(payload.pagination)) return payload.pagination as PaginationMeta;
    if (isObject(payload.meta)) return payload.meta as PaginationMeta;
    if (isObject(payload.data)) return normalizePagination(payload.data);
    return {};
}

function getNestedValue(source: PlainObject, keys: string[]): unknown {
    for (const key of keys) {
        const value = key.split(".").reduce<unknown>((current, part) => {
            if (!isObject(current)) return undefined;
            return current[part];
        }, source);
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
}

function getPlatformBadges(value: unknown): string[] {
    const platforms = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    const badges = platforms
        .map((item) => String(item || "").toLowerCase())
        .filter(Boolean)
        .map((platform) => {
            if (platform.includes("youtube")) return "▶";
            if (platform.includes("instagram")) return "◎";
            if (platform.includes("tiktok")) return "♪";
            if (platform.includes("twitter") || platform.includes("x")) return "𝕏";
            return platform.slice(0, 1).toUpperCase();
        });

    return badges.length ? badges : ["▶"];
}

function getInitials(value: unknown): string {
    const text = String(value || "Campaign").trim();
    const words = text.split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("") || "C";
}

function mapCampaignDeliverable(item: PlainObject, index = 0): CampaignDeliverable {
    const title = String(
        getNestedValue(item, [
            "title",
            "name",
            "deliverableTitle",
            "contentTitle",
            "taskTitle",
            "platformDeliverable",
            "deliverableType",
            "type",
        ]) || `Deliverable ${index + 1}`
    );

    return {
        id: String(item._id || item.id || item.deliverableId || `${title}-${index}`),
        title,
        platform: String(getNestedValue(item, ["platform", "channel", "platformName"]) || "—"),
        status: String(getNestedValue(item, ["status", "deliverableStatus", "approvalStatus"]) || "Pending"),
        creatorName: String(getNestedValue(item, ["creatorName", "influencerName", "userName", "creator.name", "influencer.name"]) || "—"),
        url: String(getNestedValue(item, ["url", "link", "mediaUrl", "postUrl", "liveLink"]) || ""),
        dueDate: formatDate(getNestedValue(item, ["dueDate", "deadline", "submissionDate", "publishDate"])),
        notes: String(getNestedValue(item, ["notes", "description", "caption", "brief"]) || ""),
    };
}

function extractCampaignDeliverables(item: PlainObject): CampaignDeliverable[] {
    const value = getNestedValue(item, [
        "deliverables",
        "campaignDeliverables",
        "deliverableList",
        "deliveries",
        "tasks",
        "contents",
        "mediaDeliverables",
        "brandDeliverables",
        "requirements.deliverables",
    ]);

    if (!Array.isArray(value)) return [];
    return value.filter(isObject).map(mapCampaignDeliverable);
}

function mapCampaignToCard(item: PlainObject): CampaignCard {
    const name = String(
        getNestedValue(item, [
            "campaignTitle",
            "title",
            "productOrServiceName",
            "productName",
            "name",
        ]) || "Untitled Campaign"
    );

    const statusRaw = String(item.status || item.campaignStatus || "").toLowerCase();
    const completed = ["completed", "closed", "expired", "ended"].includes(statusRaw);
    const id = String(item._id || item.id || item.campaignId || item.campaignsId || "");
    const endValue = item.endAt || item.campaignEndDate || item.deadline || item.endDate;
    const startValue = item.startAt || item.campaignStartDate || item.startDate;

    return {
        id,
        campaignId: String(item.campaignId || item.campaignsId || item._id || item.id || ""),
        name,
        logo: getInitials(name),
        logoBg: completed ? "#EAF6FF" : "#050505",
        logoColor: completed ? "#0096D6" : "#ffffff",
        status: completed ? "Completed" : "Active",
        statusColor: completed ? "#9CCAFF" : "#43C463",
        platforms: getPlatformBadges(item.platformSelection || item.platforms || item.platform),
        liveLabel: completed ? "Deliveries" : "Live Deliveries",
        liveCount: formatCount(item.deliverablesCount || item.totalDeliverables || item.deliveryCount || item.applicantCount || 0),
        influencerCount: formatCount(item.numberOfInfluencers || item.influencerCount || item.creatorCount || item.applicantCount || 0),
        footer: completed
            ? `Completed ${formatDate(item.completedAt || item.updatedAt || endValue)}`
            : endValue
                ? `Ends ${formatDate(endValue)}`
                : "Active campaign",
        description: String(getNestedValue(item, ["description", "campaignDescription", "brief", "aboutCampaign"]) || ""),
        budget: String(getNestedValue(item, ["budget", "campaignBudget", "totalBudget", "price", "amount"]) || ""),
        startDate: formatDate(startValue),
        endDate: formatDate(endValue),
        raw: item,
        deliverables: extractCampaignDeliverables(item),
    };
}

function mapReportToPreviousSearchRow(item: PlainObject): PreviousSearchRow {
    const score = Number(item.finalAiScore || item.aiScore || getNestedValue(item, ["aiScores.finalAiScore", "finalVerdict.finalScore"]) || 0);
    const engagementRate = Number(item.engagementRate || getNestedValue(item, ["videoMetrics.engagementRate"]) || 0);
    const views = Number(item.views || getNestedValue(item, ["videoMetrics.viewCount"]) || 0);
    const dateRaw = String(item.generatedAt || item.createdAt || getNestedValue(item, ["dashboard.generatedAt"]) || "");

    return {
        reportId: String(item.reportId || item._id || item.id || ""),
        title: shorten(item.videoTitle || item.title || getNestedValue(item, ["videoMetrics.title", "hero.videoTitle"]) || "YouTube Insight Report", 28),
        url: shorten(item.videoUrl || getNestedValue(item, ["hero.livePublishedLink", "dashboard.videoOverview.videoUrl"]) || "", 34),
        profile: shorten(item.influencerName || item.channelTitle || getNestedValue(item, ["hero.influencerName", "channelMetrics.title"]) || "Creator", 24),
        engagement: engagementRate > 0 ? `${engagementRate.toFixed(2)}%` : formatCount(views),
        engagementValue: Number.isFinite(engagementRate) ? engagementRate : 0,
        aiScore: Number.isFinite(score) ? String(Math.round(score * 10) / 10) : "0",
        aiScoreValue: Number.isFinite(score) ? score : 0,
        date: formatDate(dateRaw),
        dateRaw,
        positive: score >= 50,
        thumbnailUrl: String(item.thumbnailUrl || getNestedValue(item, ["hero.thumbnailUrl", "videoMetrics.thumbnailUrl"]) || ""),
        channelLogo: String(item.channelLogo || getNestedValue(item, ["hero.channelThumbnailUrl", "channelMetrics.thumbnailUrl"]) || ""),
    };
}

function extractCampaignDetailPayload(payload: unknown): PlainObject | null {
    if (!isObject(payload)) return null;
    if (isObject(payload.doc)) return payload.doc;
    if (isObject(payload.campaign)) return payload.campaign;
    if (isObject(payload.item)) return payload.item;
    if (isObject(payload.data)) return extractCampaignDetailPayload(payload.data) || payload.data;
    return payload;
}

function AssetImage({
    src,
    alt,
    className,
    width,
    height,
}: {
    src: string;
    alt: string;
    className?: string;
    width?: number;
    height?: number;
}): React.ReactElement {
    return <img src={src} alt={alt} width={width} height={height} className={className} draggable={false} />;
}

function AvatarStack({ className = "" }: { className?: string }): React.ReactElement {
    return (
        <AssetImage
            src={AVATAR_STACK_SRC}
            alt="Creator avatar stack"
            width={70}
            height={26}
            className={`h-[26px] w-[70px] shrink-0 select-none object-contain ${className}`}
        />
    );
}

function StarIcon({ className = "" }: { className?: string }): React.ReactElement {
    return (
        <svg
            className={className}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M6.998 1.166c.284 2.291 1.545 3.553 3.836 3.837-2.291.284-3.552 1.545-3.836 3.836-.284-2.291-1.546-3.552-3.837-3.836 2.291-.284 3.553-1.546 3.837-3.837Z"
                fill="#1A1A1A"
            />
            <path
                d="M3.045 7.622c.147 1.19.802 1.845 1.992 1.993-1.19.147-1.845.802-1.992 1.992-.148-1.19-.803-1.845-1.993-1.992 1.19-.148 1.845-.803 1.993-1.993Z"
                fill="#1A1A1A"
            />
            <path
                d="M10.91 8.13c.13 1.044.704 1.619 1.748 1.748-1.044.13-1.618.704-1.748 1.748-.129-1.044-.704-1.619-1.748-1.748 1.044-.13 1.619-.704 1.748-1.748Z"
                fill="#1A1A1A"
            />
        </svg>
    );
}

function AnalyzingOverlay(): React.ReactElement {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[1px]">
            <div className="-mt-14 flex flex-col items-center">
                <div className="relative h-24 w-24">
                    <span className="sparkle-one absolute left-6 top-2 text-[32px] leading-none text-white drop-shadow-[0_10px_25px_rgba(255,255,255,0.4)]">
                        ✨
                    </span>
                    <span className="sparkle-two absolute bottom-3 right-4 text-[42px] leading-none text-white drop-shadow-[0_10px_25px_rgba(255,255,255,0.4)]">
                        ✦
                    </span>
                </div>

                <p className="mt-1 text-sm font-semibold tracking-[-0.01em] text-white">Analysing link .</p>
            </div>

            <style jsx>{`
        @keyframes sparkleFloatOne {
          0%,
          100% {
            transform: translateY(0) scale(0.82) rotate(0deg);
            opacity: 0.62;
          }

          50% {
            transform: translateY(-10px) scale(1.08) rotate(12deg);
            opacity: 1;
          }
        }

        @keyframes sparkleFloatTwo {
          0%,
          100% {
            transform: translateY(0) scale(0.88) rotate(0deg);
            opacity: 0.7;
          }

          50% {
            transform: translateY(8px) scale(1.15) rotate(-10deg);
            opacity: 1;
          }
        }

        .sparkle-one {
          animation: sparkleFloatOne 1.15s ease-in-out infinite;
        }

        .sparkle-two {
          animation: sparkleFloatTwo 1.35s ease-in-out infinite;
        }
      `}</style>
        </div>
    );
}

function HeroGradientLayer(): React.ReactElement {
    return (
        <div
            className="insight-hero-gradient pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[16px]"
            aria-hidden="true"
        >
            <div
                className="absolute inset-y-0 right-0 h-full w-[74%] min-w-[520px] rounded-br-[16px] rounded-tr-[16px]"
                style={{
                    background: HERO_GRADIENT,
                    clipPath: "polygon(18% 0%, 100% 0%, 100% 100%, 0% 100%)",
                }}
            />
        </div>
    );
}

function HeroWhiteBlurImage(): React.ReactElement {
    return (
        <div
            aria-hidden="true"
            className="insight-hero-blur pointer-events-none absolute bottom-[-210px] right-[-80px] z-[2] h-[820px] w-[840px] overflow-visible blur-[44px]"
        >
            <AssetImage
                src={HERO_WHITE_BLUR_SRC}
                alt=""
                width={840}
                height={820}
                className="h-full w-full select-none object-fill"
            />
        </div>
    );
}

function CreatorProfileBadge(): React.ReactElement {
    return (
        <div className="absolute left-[154px] top-[62px] z-[6] min-w-[132px] rounded-[0.625rem] border border-white/70 bg-white/95 px-2.5 py-1.5 shadow-[0_12px_30px_rgba(17,24,39,0.14)] backdrop-blur">
            <div className="flex items-center gap-2">
                <p className="text-[0.75rem] font-black leading-none tracking-[-0.03em] text-[#191919]">166m+</p>
                <span className="text-[0.5rem] font-medium leading-none text-[#969696]">Creators profile</span>
            </div>

            <AvatarStack className="mt-1.5 h-[20px] w-[54px]" />
        </div>
    );
}

function CombinedReachBadge(): React.ReactElement {
    return (
        <div className="absolute right-[36px] top-[268px] z-[6] rotate-[8deg] rounded-[0.75rem] border border-white/70 bg-white/95 px-3 py-2 shadow-[0_14px_38px_rgba(17,24,39,0.16)] backdrop-blur">
            <div className="flex items-center gap-2">
                <AssetImage
                    src={COINS_CHART_SRC}
                    alt="Combined engagement reach chart"
                    width={43}
                    height={43}
                    className="h-[1.75rem] w-[1.75rem] shrink-0 select-none object-contain"
                />

                <div>
                    <p className="text-[0.75rem] font-semibold leading-5 text-[#1A1A1A]" style={{ fontFamily: "Inter" }}>
                        12Billion+
                    </p>

                    <p className="mt-1 text-[0.625rem] font-medium leading-normal text-[#969696]" style={{ fontFamily: "Inter" }}>
                        Combined engagement reach
                    </p>
                </div>
            </div>
        </div>
    );
}

function AudienceMatchCard(): React.ReactElement {
    return (
        <div className="absolute bottom-[18px] left-[84px] z-[5] w-[142px] rotate-[-7deg] rounded-[14px] border border-white/80 bg-white px-3 pb-3 pt-2.5 shadow-[0_14px_34px_rgba(17,24,39,0.14)]">
            <p className="text-[0.4375rem] font-black leading-none tracking-[-0.02em] text-[#242424]">
                Audience Match Score
            </p>

            <div className="relative mx-auto mt-1.5 h-[62px] w-[104px]">
                <AssetImage
                    src={AUDIENCE_CHART_SRC}
                    alt="Audience match score chart"
                    width={82}
                    height={50}
                    className="absolute left-1/2 top-0 h-[50px] w-[82px] -translate-x-1/2 select-none object-contain"
                />

                <p className="absolute left-0 right-0 top-[30px] text-center text-[1.25rem] font-semibold leading-none tracking-[-0.05em] text-[#242424]">
                    60%
                </p>
            </div>

            <p className="text-center text-[0.5rem] font-black leading-[1.05] tracking-[-0.03em] text-[#242424]">
                Audience Match Score is Good
            </p>

            <p className="mx-auto mt-1 max-w-[108px] text-center text-[0.375rem] font-medium leading-[1.15] tracking-[-0.015em] text-[#969696]">
                this score shows a glance of the similarity between influencer and campaign
            </p>

            <div className="mt-2 flex h-[19px] items-center justify-center gap-1.5 rounded-full border border-[#E6E6E6] bg-white px-1.5 text-[0.375rem] font-medium text-[#969696]">
                <span className="inline-flex items-center gap-1">
                    <span className="h-[4px] w-[4px] rounded-full bg-[#F5524F]" />
                    Low
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="h-[4px] w-[4px] rounded-full bg-[#FF7D4D]" />
                    Average
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="h-[4px] w-[4px] rounded-full bg-[#FFB800]" />
                    Good
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="h-[4px] w-[4px] rounded-full bg-[#29A950]" />
                    High
                </span>
            </div>
        </div>
    );
}

function HeroForegroundArtwork(): React.ReactElement {
    return (
        <div className="insight-hero-visual pointer-events-none absolute inset-y-0 right-0 z-[4]">
            <AssetImage
                src={HERO_IMAGE_SRC}
                alt="Creators with cameras and skateboards"
                width={557}
                height={470}
                className="insight-hero-main-image absolute bottom-0 right-[26px] z-[4] h-[94%] max-h-[482px] w-auto select-none object-contain"
            />

            <div className="pointer-events-auto absolute right-[148px] top-[26px] z-[7] inline-flex h-8 items-center gap-2 rounded-full bg-white/92 px-3 text-[0.625rem] font-medium text-[#7B7F88] shadow-[0_8px_28px_rgba(17,24,39,0.08)] backdrop-blur">
                <StarIcon className="h-3.5 w-3.5" />
                Now Create Campaign with the Power of AI
                <X className="h-3.5 w-3.5 text-[#161616]" />
            </div>

            <CreatorProfileBadge />
            <CombinedReachBadge />
            <AudienceMatchCard />
        </div>
    );
}

function CampaignCardItem({
    campaign,
    onView,
}: {
    campaign: CampaignCard;
    onView?: (campaign: CampaignCard) => void;
}): React.ReactElement {
    return (
        <article className="rounded-[18px] border border-[#E9E9E9] bg-white p-4 shadow-[0_1px_8px_rgba(17,24,39,0.03)]">
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-sm font-black"
                        style={{ backgroundColor: campaign.logoBg, color: campaign.logoColor }}
                    >
                        {campaign.logo}
                    </div>

                    <h3 className="whitespace-pre-line pt-0.5 text-sm font-bold leading-[1.25] tracking-[-0.02em] text-[#111111]">
                        {campaign.name}
                    </h3>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 pt-1 text-xs font-medium text-[#6E737D]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: campaign.statusColor }} />
                    {campaign.status}
                </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 border-b border-[#EFEFEF] pb-4">
                <div>
                    <p className="text-xs font-medium text-[#8A8F98]">Platform</p>
                    <div className="mt-2 flex items-center -space-x-1.5 text-[11px]">
                        {campaign.platforms.map((item, index) => (
                            <span
                                key={`${item}-${index}`}
                                className="grid h-5 w-5 place-items-center rounded-full border border-white bg-[#F6F6F6]"
                            >
                                {item}
                            </span>
                        ))}
                    </div>
                </div>

                <div>
                    <p className="text-xs font-medium text-[#8A8F98]">{campaign.liveLabel}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#202124]">
                        <FileText className="h-3.5 w-3.5 text-[#A0A5AE]" />
                        {campaign.liveCount}
                    </div>
                </div>

                <div>
                    <p className="text-xs font-medium text-[#8A8F98]">Influencer</p>
                    <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#202124]">
                        <Users className="h-3.5 w-3.5 text-[#A0A5AE]" />
                        {campaign.influencerCount}
                    </div>
                </div>
            </div>

            <button
                type="button"
                onClick={() => onView?.(campaign)}
                className="mt-4 h-9 w-full rounded-[8px] border border-[#ECECEC] bg-white text-xs font-semibold text-[#202124] transition hover:border-[#DADADA] hover:bg-[#FAFAFA]"
            >
                View Deliverables
            </button>

            <p className="mt-3 text-center text-xs font-medium text-[#B4B4B4]">{campaign.footer}</p>
        </article>
    );
}

function AllCampaignsSection({
    campaigns,
    loading,
    error,
    onViewCampaign,
}: {
    campaigns: CampaignCard[];
    loading: boolean;
    error: string;
    onViewCampaign: (campaign: CampaignCard) => void;
}): React.ReactElement {
    const initialLimit = useCampaignInitialLimit();
    const [expanded, setExpanded] = useState<boolean>(false);
    const shouldCollapse = campaigns.length > initialLimit;
    const visibleCampaigns = expanded || !shouldCollapse ? campaigns : campaigns.slice(0, initialLimit);

    useEffect(() => {
        setExpanded(false);
    }, [initialLimit, campaigns.length]);

    return (
        <section className="mt-6">
            <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#1E1E1E]">All Campaigns</h2>

                {shouldCollapse ? (
                    <button
                        type="button"
                        onClick={() => setExpanded((value) => !value)}
                        className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E6E6E6] bg-white px-3 py-2 text-xs font-semibold text-[#1E1E1E] transition hover:bg-[#FAFAFA]"
                    >
                        {expanded ? "Show Less" : "Show All"}
                        <ChevronDown className={expanded ? "h-3.5 w-3.5 rotate-180 transition" : "h-3.5 w-3.5 transition"} />
                    </button>
                ) : null}
            </div>

            {loading ? (
                <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-6 text-sm font-semibold text-[#6E737D]">
                    Loading campaigns...
                </div>
            ) : error ? (
                <div className="rounded-[14px] border border-red-100 bg-red-50 p-6 text-sm font-semibold text-red-600">
                    {error}
                </div>
            ) : campaigns.length ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleCampaigns.map((campaign) => (
                        <CampaignCardItem key={campaign.id || campaign.campaignId || campaign.name} campaign={campaign} onView={onViewCampaign} />
                    ))}
                </div>
            ) : (
                <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-6 text-sm font-semibold text-[#6E737D]">
                    No campaigns found for this brand.
                </div>
            )}
        </section>
    );
}

function CampaignDeliverablesDrawer({
    open,
    campaign,
    loading,
    error,
    onClose,
}: {
    open: boolean;
    campaign: CampaignCard | null;
    loading: boolean;
    error: string;
    onClose: () => void;
}): React.ReactElement | null {
    if (!open) return null;

    const deliverables = campaign?.deliverables || [];

    return (
        <div className="fixed inset-0 z-[9998] flex justify-end bg-black/30 backdrop-blur-[1px]" role="dialog" aria-modal="true">
            <button type="button" aria-label="Close deliverables" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} />

            <aside className="relative z-[9999] flex h-full w-full max-w-[520px] flex-col overflow-hidden bg-white shadow-[-18px_0_50px_rgba(15,23,42,0.16)]">
                <div className="flex items-start justify-between gap-4 border-b border-[#EFEFEF] px-6 py-5">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#969696]">Campaign Deliverables</p>
                        <h3 className="mt-1 truncate text-xl font-semibold tracking-[-0.02em] text-[#1E1E1E]">
                            {campaign?.name || "Campaign"}
                        </h3>
                        <p className="mt-1 text-xs font-medium text-[#8A8F98]">{campaign?.footer || ""}</p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#ECECEC] bg-white text-[#1E1E1E] transition hover:bg-[#FAFAFA]"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {campaign ? (
                        <div className="mb-5 grid grid-cols-2 gap-3">
                            {[
                                ["Status", campaign.status],
                                ["Influencers", campaign.influencerCount],
                                ["Deliverables", campaign.liveCount],
                                ["Budget", campaign.budget || "—"],
                                ["Start", campaign.startDate],
                                ["End", campaign.endDate],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-[12px] border border-[#EEEEEE] bg-[#FAFAFA] p-3">
                                    <p className="text-[11px] font-medium text-[#8A8F98]">{label}</p>
                                    <p className="mt-1 truncate text-sm font-semibold text-[#1E1E1E]">{value || "—"}</p>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {campaign?.description ? (
                        <div className="mb-5 rounded-[12px] border border-[#EEEEEE] bg-white p-4">
                            <p className="text-xs font-semibold text-[#4B4F58]">Brief</p>
                            <p className="mt-2 text-sm leading-6 text-[#6E737D]">{campaign.description}</p>
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="flex items-center gap-2 rounded-[12px] border border-[#EEEEEE] bg-[#FAFAFA] p-4 text-sm font-semibold text-[#6E737D]">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading latest deliverables...
                        </div>
                    ) : error ? (
                        <div className="mb-4 rounded-[12px] border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
                            {error}
                        </div>
                    ) : null}

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-[#1E1E1E]">Deliverable List</h4>
                            <span className="rounded-full bg-[#F4F4F5] px-2.5 py-1 text-[11px] font-semibold text-[#6E737D]">
                                {deliverables.length} item{deliverables.length === 1 ? "" : "s"}
                            </span>
                        </div>

                        {deliverables.length ? (
                            deliverables.map((item) => (
                                <article key={item.id} className="rounded-[14px] border border-[#EEEEEE] bg-white p-4 shadow-[0_1px_8px_rgba(17,24,39,0.03)]">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-[#1E1E1E]">{item.title}</p>
                                            <p className="mt-1 text-xs font-medium text-[#8A8F98]">{item.creatorName}</p>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-[#F4F4F5] px-2.5 py-1 text-[11px] font-semibold text-[#4B4F58]">
                                            {item.status}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <p className="font-medium text-[#8A8F98]">Platform: <span className="font-semibold text-[#1E1E1E]">{item.platform}</span></p>
                                        <p className="font-medium text-[#8A8F98]">Due: <span className="font-semibold text-[#1E1E1E]">{item.dueDate}</span></p>
                                    </div>

                                    {item.notes ? <p className="mt-3 text-xs leading-5 text-[#6E737D]">{item.notes}</p> : null}
                                    {item.url ? (
                                        <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#111111] hover:underline">
                                            Open Link
                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                        </a>
                                    ) : null}
                                </article>
                            ))
                        ) : (
                            <div className="rounded-[12px] border border-[#EEEEEE] bg-[#FAFAFA] p-5 text-sm font-semibold text-[#6E737D]">
                                No deliverables were found for this campaign yet.
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </div>
    );
}

function ScoreTrend({ positive }: { positive: boolean }): React.ReactElement {
    const bars = positive ? [6, 9, 7, 12, 16, 13, 19] : [18, 13, 15, 9, 11, 7, 5];

    return (
        <span className="ml-1 inline-flex h-5 items-end gap-[2px] align-middle">
            {bars.map((height, index) => (
                <span
                    key={`${height}-${index}`}
                    className={positive ? "w-[3px] rounded-t bg-emerald-300" : "w-[3px] rounded-t bg-red-300"}
                    style={{ height }}
                />
            ))}
        </span>
    );
}

function PreviousSearchesSection({
    rows,
    loading,
    error,
    hasMore,
    loadingMore,
    dateFilter,
    sortBy,
    sortOrder,
    searchTerm,
    onDateFilterChange,
    onSortChange,
    onSearchChange,
    onLoadMore,
    onOpenReport,
}: {
    rows: PreviousSearchRow[];
    loading: boolean;
    error: string;
    hasMore: boolean;
    loadingMore: boolean;
    dateFilter: DateFilterKey;
    sortBy: PreviousSearchSortKey;
    sortOrder: SortOrder;
    searchTerm: string;
    onDateFilterChange: (value: DateFilterKey) => void;
    onSortChange: (value: PreviousSearchSortKey) => void;
    onSearchChange: (value: string) => void;
    onLoadMore: () => void;
    onOpenReport: (row: PreviousSearchRow) => void;
}): React.ReactElement {
    return (
        <section className="mt-9 pb-8">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#1E1E1E]">Previous Searches</h2>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                        value={searchTerm}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search creator or video"
                        className="h-10 w-full rounded-[8px] border border-[#E6E6E6] bg-white px-3 text-xs font-semibold text-[#1E1E1E] outline-none transition placeholder:text-[#A0A4AC] focus:border-[#111111] sm:w-[220px]"
                    />

                    <label className="relative inline-flex h-10 items-center rounded-[8px] border border-[#E6E6E6] bg-white px-3 text-xs font-semibold text-[#1E1E1E] transition hover:bg-[#FAFAFA]">
                        <select
                            value={dateFilter}
                            onChange={(event) => onDateFilterChange(event.target.value as DateFilterKey)}
                            className="h-full appearance-none bg-transparent pr-7 text-xs font-semibold outline-none"
                        >
                            {DATE_FILTER_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5" />
                    </label>
                </div>
            </div>

            <div className="overflow-x-auto">
                <div className="min-w-[900px] overflow-hidden rounded-[14px] border border-[#EEEEEE] bg-white">
                    <div className="grid grid-cols-[2fr_0.65fr_1.35fr_1.15fr_1fr_1.15fr] items-center bg-[#FAFAFA] px-4 py-4 text-xs font-bold text-[#4B4F58]">
                        {PREVIOUS_SEARCH_COLUMNS.map((column) => (
                            <button
                                key={column.label}
                                type="button"
                                disabled={!column.sortBy}
                                onClick={() => column.sortBy && onSortChange(column.sortBy)}
                                className="flex items-center justify-between gap-2 pr-3 text-left disabled:cursor-default"
                            >
                                {column.label}
                                {column.sortBy ? (
                                    <ChevronsUpDown className={sortBy === column.sortBy ? "h-3.5 w-3.5 text-[#111111]" : "h-3.5 w-3.5 text-[#A0A4AC]"} />
                                ) : null}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="px-4 py-6 text-sm font-semibold text-[#6E737D]">Loading previous searches...</div>
                    ) : error ? (
                        <div className="px-4 py-6 text-sm font-semibold text-red-600">{error}</div>
                    ) : rows.length ? (
                        <div className="divide-y divide-[#EFEFEF]">
                            {rows.map((row, index) => (
                                <button
                                    type="button"
                                    key={`${row.reportId}-${index}`}
                                    onClick={() => onOpenReport(row)}
                                    className="grid w-full grid-cols-[2fr_0.65fr_1.35fr_1.15fr_1fr_1.15fr] items-center px-4 py-3 text-left text-xs text-[#242424] transition hover:bg-[#FAFAFA]"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-gradient-to-br from-fuchsia-200 via-violet-100 to-amber-100 text-[10px]">
                                            {row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : "▶"}
                                        </div>

                                        <div className="min-w-0">
                                            <p className="truncate font-bold">{row.title}</p>
                                            <p className="truncate text-[10px] font-medium text-[#A0A4AC]">{row.url}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-red-50 text-red-600">
                                            <Youtube className="h-3.5 w-3.5 fill-red-600" />
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-300 via-blue-400 to-pink-400 text-[11px]">
                                            {row.channelLogo ? <img src={row.channelLogo} alt="" className="h-full w-full object-cover" /> : "👤"}
                                        </span>
                                        <span className="font-semibold">{row.profile}</span>
                                    </div>

                                    <div className={row.positive ? "font-bold text-emerald-500" : "font-bold text-red-500"}>
                                        <span>
                                            {row.positive ? "↗" : "↘"} {row.engagement}
                                        </span>
                                        <ScoreTrend positive={row.positive} />
                                    </div>

                                    <div className="font-bold text-[#262626]">
                                        <span className={row.positive ? "text-emerald-500" : "text-red-500"}>{row.positive ? "↗" : "↘"}</span>{" "}
                                        {row.aiScore}
                                        <span className="text-[10px] font-medium text-[#A7AAB1]">/100</span>
                                    </div>

                                    <div className="font-semibold">{row.date}</div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="px-4 py-6 text-sm font-semibold text-[#6E737D]">
                            No previous searches found for {getDateFilterLabel(dateFilter).toLowerCase()}.
                        </div>
                    )}
                </div>
            </div>

            {hasMore ? (
                <div className="-mt-7 flex justify-center">
                    <button
                        type="button"
                        onClick={onLoadMore}
                        disabled={loadingMore}
                        className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#111111] px-4 text-xs font-semibold text-white shadow-[0_12px_28px_rgba(17,17,17,0.18)] disabled:opacity-70"
                    >
                        <Loader2 className={loadingMore ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                        {loadingMore ? "Loading" : "Load more"}
                    </button>
                </div>
            ) : null}
        </section>
    );
}

function GenerateReportBox({
    videoUrl,
    loading,
    onVideoUrlChange,
    onAnalyze,
}: {
    videoUrl: string;
    loading: boolean;
    onVideoUrlChange: (value: string) => void;
    onAnalyze: () => void;
}): React.ReactElement {
    return (
        <div
            className="mt-6 w-full max-w-[414px] p-2"
            style={{
                borderRadius: "0.75rem",
                border: "1px solid var(--Light-Border-Subtle, #E6E6E6)",
                background: "var(--Light-Background-Subtle, #F9F9F9)",
            }}
        >
            <input
                value={videoUrl}
                onChange={(event) => onVideoUrlChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !loading) onAnalyze();
                }}
                placeholder="Search for creators live media link (ex: www.youtube..."
                className="h-9 w-full rounded-[8px] bg-transparent px-3 text-sm font-normal text-[#191919] outline-none placeholder:text-[#B8BBC2]"
            />

            <div className="flex flex-col gap-2 px-2 pb-1 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#202124]">
                    Youtube
                    <ChevronDown className="h-3.5 w-3.5 text-[#71757F]" />
                </button>

                <button
                    type="button"
                    onClick={onAnalyze}
                    disabled={loading}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[#111111] px-4 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(17,17,17,0.18)] transition hover:bg-[#252525] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                >
                    {loading ? (
                        <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Generating
                        </>
                    ) : (
                        <>
                            <StarIcon className="h-3.5 w-3.5 [&_path]:fill-white" />
                            Generate Report
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

export default function YoutubeInsightAnalyzePage({ mode = "auto" }: { mode?: InsightOsMode } = {}): React.ReactElement {
    const router = useRouter();
    const pathname = usePathname();
    const showBrandOnlySections = mode === "brand" || (mode === "auto" && getShowBrandOnlySections(pathname));
    const isBrandMode = showBrandOnlySections;

    const [videoUrl, setVideoUrl] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [brandId, setBrandId] = useState<string>("");
    const [brandName, setBrandName] = useState<string>("");
    const [campaigns, setCampaigns] = useState<CampaignCard[]>([]);
    const [previousSearchRows, setPreviousSearchRows] = useState<PreviousSearchRow[]>([]);
    const [campaignsLoading, setCampaignsLoading] = useState<boolean>(false);
    const [reportsLoading, setReportsLoading] = useState<boolean>(false);
    const [campaignsError, setCampaignsError] = useState<string>("");
    const [reportsError, setReportsError] = useState<string>("");
    const [reportsPage, setReportsPage] = useState<number>(1);
    const [reportsTotalPages, setReportsTotalPages] = useState<number>(1);
    const [loadingMoreReports, setLoadingMoreReports] = useState<boolean>(false);
    const [dateFilter, setDateFilter] = useState<DateFilterKey>("30d");
    const [reportsSortBy, setReportsSortBy] = useState<PreviousSearchSortKey>("createdAt");
    const [reportsSortOrder, setReportsSortOrder] = useState<SortOrder>("desc");
    const [reportsSearchTerm, setReportsSearchTerm] = useState<string>("");
    const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
    const [drawerCampaign, setDrawerCampaign] = useState<CampaignCard | null>(null);
    const [drawerLoading, setDrawerLoading] = useState<boolean>(false);
    const [drawerError, setDrawerError] = useState<string>("");

    const reportListUrl = useMemo(() => apiPath("/api/insights"), []);

    useEffect(() => {
        if (!isBrandMode) return;

        const resolvedBrandId = getStoredBrandId();
        const resolvedBrandName = getStoredBrandName();
        setBrandId(resolvedBrandId);
        setBrandName(resolvedBrandName);

        if (!resolvedBrandId) {
            setCampaignsError("Brand id not found. Please save brand data with _id in localStorage/sessionStorage.");
            setReportsError("Brand id not found. Previous searches cannot be loaded.");
        }
    }, [isBrandMode]);

    useEffect(() => {
        if (!isBrandMode || !brandId) return;
        let cancelled = false;

        const loadCampaigns = async (): Promise<void> => {
            try {
                setCampaignsLoading(true);
                setCampaignsError("");
                const response = await axios.post<ApiListPayload>(
                    apiPath("/campaign/get-by-brand"),
                    { brandId, page: 1, limit: 1000, status: "" },
                    { headers: getAuthHeaders() }
                );
                if (!cancelled) setCampaigns(normalizeItems(response.data).map(mapCampaignToCard));
            } catch (err) {
                const message = axios.isAxiosError(err)
                    ? String(err.response?.data?.message || err.message || "Failed to load brand campaigns.")
                    : "Failed to load brand campaigns.";
                if (!cancelled) setCampaignsError(message);
            } finally {
                if (!cancelled) setCampaignsLoading(false);
            }
        };

        void loadCampaigns();

        return () => {
            cancelled = true;
        };
    }, [isBrandMode, brandId]);

    useEffect(() => {
        // Reports are always saved in this app, so the history always loads — unlike the
        // original, where public mode generated nothing to list.
        let cancelled = false;

        const loadReports = async (): Promise<void> => {
            try {
                setReportsLoading(true);
                setReportsError("");
                const response = await axios.get<ApiListPayload>(reportListUrl, {
                    headers: getAuthHeaders(),
                    params: {
                        brandId,
                        page: 1,
                        limit: 10,
                        sortBy: reportsSortBy,
                        sortOrder: reportsSortOrder,
                        search: reportsSearchTerm.trim() || undefined,
                        ...getDateFilterParams(dateFilter),
                    },
                });

                const pagination = normalizePagination(response.data);
                if (!cancelled) {
                    setPreviousSearchRows(normalizeItems(response.data).map(mapReportToPreviousSearchRow));
                    setReportsPage(Number(pagination.page || 1));
                    setReportsTotalPages(Number(pagination.totalPages || 1));
                }
            } catch (err) {
                const message = axios.isAxiosError(err)
                    ? String(err.response?.data?.message || err.message || "Failed to load previous searches.")
                    : "Failed to load previous searches.";
                if (!cancelled) setReportsError(message);
            } finally {
                if (!cancelled) setReportsLoading(false);
            }
        };

        void loadReports();

        return () => {
            cancelled = true;
        };
    }, [isBrandMode, brandId, reportListUrl, dateFilter, reportsSortBy, reportsSortOrder, reportsSearchTerm]);

    const handlePreviousSearchSort = (nextSortBy: PreviousSearchSortKey): void => {
        if (nextSortBy === reportsSortBy) {
            setReportsSortOrder((current) => (current === "asc" ? "desc" : "asc"));
            return;
        }

        setReportsSortBy(nextSortBy);
        setReportsSortOrder("desc");
    };

    const handleLoadMorePreviousSearches = async (): Promise<void> => {
        if (!brandId || loadingMoreReports || reportsPage >= reportsTotalPages) return;

        try {
            setLoadingMoreReports(true);
            const nextPage = reportsPage + 1;
            const response = await axios.get<ApiListPayload>(reportListUrl, {
                headers: getAuthHeaders(),
                params: {
                    brandId,
                    page: nextPage,
                    limit: 10,
                    sortBy: reportsSortBy,
                    sortOrder: reportsSortOrder,
                    search: reportsSearchTerm.trim() || undefined,
                    ...getDateFilterParams(dateFilter),
                },
            });

            const pagination = normalizePagination(response.data);
            setPreviousSearchRows((prev) => [...prev, ...normalizeItems(response.data).map(mapReportToPreviousSearchRow)]);
            setReportsPage(Number(pagination.page || nextPage));
            setReportsTotalPages(Number(pagination.totalPages || reportsTotalPages));
        } catch (err) {
            const message = axios.isAxiosError(err)
                ? String(err.response?.data?.message || err.message || "Failed to load more previous searches.")
                : "Failed to load more previous searches.";
            setReportsError(message);
        } finally {
            setLoadingMoreReports(false);
        }
    };

    const handleOpenCampaignDrawer = async (campaign: CampaignCard): Promise<void> => {
        setDrawerOpen(true);
        setDrawerCampaign(campaign);
        setDrawerError("");

        const id = campaign.campaignId || campaign.id;
        if (!id) return;

        try {
            setDrawerLoading(true);

            const response = await axios.post<ApiListPayload>(
                apiPath("/campaign/view-campaign-brand"),
                { campaignId: id },
                { headers: getAuthHeaders() }
            );

            const detail = extractCampaignDetailPayload(response.data);
            if (!detail) return;

            const merged = { ...campaign.raw, ...detail };
            const updatedCampaign = mapCampaignToCard(merged);

            setDrawerCampaign({
                ...updatedCampaign,
                id: updatedCampaign.id || campaign.id,
                campaignId: updatedCampaign.campaignId || campaign.campaignId,
            });
        } catch {
            setDrawerError("");
        } finally {
            setDrawerLoading(false);
        }
    };

    const handleAnalyze = async (): Promise<void> => {
        try {
            setError("");
            const cleanUrl = videoUrl.trim();

            if (!cleanUrl) {
                setError("Please enter a YouTube video link.");
                return;
            }

            if (isBrandMode && !brandId) {
                setError("Brand id not found. Please make sure brand data is saved with _id before generating a saved brand report.");
                return;
            }

            setLoading(true);
            const token = getToken();

            const response = await axios.post<ApiResponse>(
                apiPath("/api/insights/analyze"),
                {
                    videoUrl: cleanUrl,
                    saveReport: isBrandMode,
                    sourceContext: isBrandMode ? "brand_insight_os" : "public_insight_os",
                    ...(isBrandMode && brandId ? { brandId } : {}),
                    ...(isBrandMode && brandName ? { brandName } : {}),
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                }
            );

            if (!response.data?.success || !response.data?.data) {
                throw new Error(response.data?.message || "Failed to analyze video.");
            }

            const backendData = response.data.data;
            const frontendReport = extractFrontendReport(backendData);
            const reportId = extractReportId(backendData);

            if (!frontendReport) {
                throw new Error("Backend response does not contain report data.");
            }

            sessionStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(frontendReport));
            if (reportId) sessionStorage.setItem(REPORT_ID_STORAGE_KEY, reportId);

            // This is the only place reports live here — there's no separate brand-mode route to
            // branch to, unlike the app this component was ported from.
            router.push(reportId ? `/insights/report?reportId=${reportId}` : "/insights/report");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Something went wrong while analyzing the video.";
            setError(message);
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen overflow-x-hidden bg-white px-0 py-0 text-[#161616]">
            {loading ? <AnalyzingOverlay /> : null}

            <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-5 sm:py-6">
                <section
                    className="insight-hero-section relative min-h-[360px] overflow-hidden rounded-[16px] px-5 py-6 shadow-[0_1px_0_rgba(15,23,42,0.02)] md:min-h-[392px] md:px-8 md:py-8 lg:px-10"
                    style={{ containerType: "inline-size", containerName: "insightHero" }}
                >
                    <div className="insight-hero-copy relative z-20 max-w-[430px]">
                        <h1
                            className="max-w-[390px]"
                            style={{
                                color: "var(--Light-Text-Primary, #1A1A1A)",
                                fontFamily: "var(--Font-Family-Inter, Inter)",
                                fontSize: "clamp(2rem, 4cqw, 2.5rem)",
                                fontStyle: "normal",
                                fontWeight: 600,
                                lineHeight: "clamp(2.45rem, 4.8cqw, 3rem)",
                                letterSpacing: "var(--Letter-Spacing--1, -0.0625rem)",
                            }}
                        >
                            Analyse YouTube profiles & latest videos
                        </h1>

                        {/* <p
                            className="mt-3 max-w-[390px]"
                            style={{
                                color: "var(--Light-Text-Secondary, #969696)",
                                fontFamily: "var(--Font-Family-Inter, Inter)",
                                fontSize: "var(--Font-Size-14, 0.875rem)",
                                fontStyle: "normal",
                                fontWeight: "var(--Font-Weight-regular, 400)",
                                lineHeight: "var(--Line-Height-20, 1.25rem)",
                                letterSpacing: "var(--Letter-Spacing-0, 0)",
                            }}
                        >
                            Paste a YouTube video link, creator profile, channel URL, or @handle. If it’s a profile, Insight OS automatically analyses the creator’s latest public video.
                        </p> */}

                        <GenerateReportBox
                            videoUrl={videoUrl}
                            loading={loading}
                            onVideoUrlChange={setVideoUrl}
                            onAnalyze={() => void handleAnalyze()}
                        />

                        {error ? (
                            <div className="mt-3 max-w-[414px] rounded-[10px] border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                                {error}
                            </div>
                        ) : null}

                        <div className="mt-7 flex flex-wrap items-center gap-3">
                            <AvatarStack />

                            <p
                                className="max-w-[340px] truncate"
                                style={{
                                    overflow: "hidden",
                                    color: "var(--Light-Text-Secondary, #969696)",
                                    textAlign: "center",
                                    textOverflow: "ellipsis",
                                    fontFamily: "var(--Font-Family-Inter, Inter)",
                                    fontSize: "var(--Font-Size-14, 0.875rem)",
                                    fontStyle: "normal",
                                    fontWeight: "var(--Font-Weight-regular, 400)",
                                    lineHeight: "var(--Line-Height-20, 1.25rem)",
                                    letterSpacing: "var(--Letter-Spacing-0, 0)",
                                }}
                            >
                                AI-powered YouTube report for videos, channels, profiles, and latest uploads
                            </p>
                        </div>
                    </div>

                    <HeroGradientLayer />
                    <HeroWhiteBlurImage />
                    <HeroForegroundArtwork />

                    <style jsx global>{`
                        .insight-hero-gradient {
                            display: block;
                        }

                        .insight-hero-blur,
                        .insight-hero-visual {
                            display: none;
                        }

                        .insight-hero-copy {
                            max-width: min(100%, 430px);
                        }

                        @container insightHero (max-width: 639px) {
                            .insight-hero-gradient > div {
                                width: 100%;
                                min-width: 0;
                                opacity: 0.72;
                                clip-path: polygon(28% 0%, 100% 0%, 100% 100%, 8% 100%) !important;
                            }

                            .insight-hero-copy {
                                max-width: 100%;
                            }
                        }

                        @container insightHero (min-width: 640px) {
                            .insight-hero-section {
                                min-height: 392px;
                            }

                            .insight-hero-blur,
                            .insight-hero-visual {
                                display: block;
                            }

                            .insight-hero-copy {
                                max-width: clamp(320px, 42cqw, 410px);
                            }

                            .insight-hero-gradient > div {
                                width: 76%;
                                min-width: 560px;
                            }

                            .insight-hero-visual {
                                right: 0;
                                width: 760px;
                                transform: scale(0.54);
                                transform-origin: right bottom;
                            }

                            .insight-hero-blur {
                                right: 0;
                                transform: scale(0.58);
                                transform-origin: right bottom;
                            }
                        }

                        @container insightHero (min-width: 768px) {
                            .insight-hero-copy {
                                max-width: clamp(340px, 41cqw, 420px);
                            }

                            .insight-hero-gradient > div {
                                width: 74%;
                                min-width: 610px;
                            }

                            .insight-hero-visual {
                                transform: scale(0.62);
                            }

                            .insight-hero-blur {
                                transform: scale(0.66);
                            }
                        }

                        @container insightHero (min-width: 880px) {
                            .insight-hero-visual {
                                transform: scale(0.70);
                            }

                            .insight-hero-blur {
                                transform: scale(0.74);
                            }
                        }

                        @container insightHero (min-width: 980px) {
                            .insight-hero-section {
                                min-height: 420px;
                            }

                            .insight-hero-copy {
                                max-width: clamp(370px, 39cqw, 430px);
                            }

                            .insight-hero-visual {
                                transform: scale(0.82);
                            }

                            .insight-hero-blur {
                                transform: scale(0.86);
                            }
                        }

                        @container insightHero (min-width: 1120px) {
                            .insight-hero-section {
                                min-height: 454px;
                            }

                            .insight-hero-visual {
                                transform: scale(0.94);
                            }

                            .insight-hero-blur {
                                transform: scale(0.98);
                            }
                        }

                        @container insightHero (min-width: 1260px) {
                            .insight-hero-visual,
                            .insight-hero-blur {
                                transform: none;
                            }
                        }
                    `}</style>
                </section>

                <PreviousSearchesSection
                    rows={previousSearchRows}
                    loading={reportsLoading}
                    error={reportsError}
                    hasMore={reportsPage < reportsTotalPages}
                    loadingMore={loadingMoreReports}
                    dateFilter={dateFilter}
                    sortBy={reportsSortBy}
                    sortOrder={reportsSortOrder}
                    searchTerm={reportsSearchTerm}
                    onDateFilterChange={setDateFilter}
                    onSortChange={handlePreviousSearchSort}
                    onSearchChange={setReportsSearchTerm}
                    onLoadMore={() => void handleLoadMorePreviousSearches()}
                    onOpenReport={(row) => {
                        if (row.reportId) router.push(`/insights/report?reportId=${encodeURIComponent(row.reportId)}`);
                    }}
                />
                {/* {showBrandOnlySections ? (
                    <>
                        <AllCampaignsSection
                            campaigns={campaigns}
                            loading={campaignsLoading}
                            error={campaignsError}
                            onViewCampaign={(campaign) => {
                                void handleOpenCampaignDrawer(campaign);
                            }}
                        />
                    </>
                ) : null} */}
            </div>

            {/* <CampaignDeliverablesDrawer
                open={drawerOpen}
                campaign={drawerCampaign}
                loading={drawerLoading}
                error={drawerError}
                onClose={() => {
                    setDrawerOpen(false);
                    setDrawerError("");
                }}
            /> */}
        </main>
    );
}
