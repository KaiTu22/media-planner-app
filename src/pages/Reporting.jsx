import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { jsonpRequest } from '../api/appsScript';
import { SANDBOX_API_URL } from '../api/config';

// Ported from the standalone Deal-Dashboard app (2026-09-16) — see the
// "Data source" comment below for what changed and what didn't.

// ---------------------------------------------------------------------------
// Minimal inline icon set (stands in for lucide-react, no extra dependency)
// ---------------------------------------------------------------------------
function Icon({ size = 16, strokeWidth = 2, className, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}
const ChevronRight = (props) => <Icon {...props}><polyline points="9 18 15 12 9 6" /></Icon>;
const ChevronDown = (props) => <Icon {...props}><polyline points="6 9 12 15 18 9" /></Icon>;
const RefreshCw = (props) => (
  <Icon {...props}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </Icon>
);
const AlertCircle = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </Icon>
);
const Loader2 = (props) => (
  <Icon {...props}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </Icon>
);

// ---------------------------------------------------------------------------
// Data source
// ---------------------------------------------------------------------------
// Ported 2026-09-16 from the standalone Deal-Dashboard app, which read
// directly from Supabase's closed_deals table via PostgREST. Now reads the
// same rows (same field names, deliberately preserved) from the Sheets/Apps
// Script backend's listClosedDeals action instead — see
// media-planner-sandbox/Code.gs and media-planner-tool's dual-write sync.
// Read-only: this file only ever issues a listClosedDeals read. No
// create/update/delete call exists anywhere below.
const TABLE = "ClosedDeals";

// ---------------------------------------------------------------------------
// Taxonomy / ordering
// ---------------------------------------------------------------------------
const CATEGORY_ORDER = [
  { key: "scatter", label: "Standard Scatter", accent: "#5B6B66" },
  { key: "tentpole", label: "Show-Tentpole", accent: "#B8873B" },
  { key: "upfront", label: "Upfront", accent: "#2B5F8A" },
  { key: "uncategorized", label: "Uncategorized", accent: "#8A8378" },
];

const STATUS_ORDER = [
  { key: "verbal_pending", label: "Verbal / Pending", accent: "#8A8378" },
  { key: "closed_pending_verification", label: "Pending Verification", accent: "#C2801A" },
  { key: "verified", label: "Verified Sold", accent: "#2F6D4F" },
  { key: "needs_reverification", label: "Needs Re-Verification", accent: "#B33F3F" },
];

const BREAKDOWN_ORDER = [
  { key: "talent", label: "Production & Talent" },
  { key: "media", label: "Paid Media" },
  { key: "social", label: "Social Partnership" },
  { key: "streaming", label: "Streaming" },
  { key: "linear", label: "Linear" },
  { key: "fees", label: "Fees" },
  { key: "brandFunded", label: "Brand Funded Content" },
  { key: "addedValue", label: "Added Value", noMargin: true },
];

// The Media Planner's other, coarser breakdown — Creative / O&O / Added
// Value / Brand Funded Content — synced onto every deal's snapshot as
// `categoryBreakdown4`, alongside the 7-category `categoryBreakdown7` above.
const CATEGORY4_ORDER = [
  { key: "creative", label: "Creative" },
  { key: "oo", label: "O&O" },
  { key: "addedvalue", label: "Added Value", noMargin: true },
  { key: "brandfunded", label: "Brand Funded Content" },
];

// Fixed-order categorical palette (8 hues, validated for adjacent-pair CVD
// separation against a white chart surface — see the data-viz skill). Order
// is assigned by category identity, never by rank/size, so a category that
// happens to be $0 and drops out of view this time doesn't shift anyone
// else's color next time it reappears.
const BREAKDOWN_COLORS = {
  talent: "#2a78d6",
  media: "#eb6834",
  social: "#1baf7a",
  streaming: "#eda100",
  linear: "#e87ba4",
  fees: "#008300",
  brandFunded: "#4a3aa7",
  addedValue: "#e34948",
};

const INK = "#16211E";
const PAPER = "#F7F6F3";
const LINE = "#E4E0D6";
const TEAL = "#12403A";

// ---------------------------------------------------------------------------
// Filter helpers (Type = deal_category, Deal Category = deal_status,
// Show = tentpole_show_name, Brand = brand_name, Agency = agency_name)
// ---------------------------------------------------------------------------
const TYPE_LABELS = Object.fromEntries(CATEGORY_ORDER.map((c) => [c.key, c]));
const STATUS_LABELS = Object.fromEntries(STATUS_ORDER.map((s) => [s.key, s]));

function typeKeyOf(deal) {
  const raw = (deal.deal_category || "").trim().toLowerCase();
  return CATEGORY_ORDER.some((c) => c.key === raw) ? raw : "uncategorized";
}
function showNameOf(deal) {
  return (deal.tentpole_show_name || "").trim() || "Unspecified Show";
}
function brandNameOf(deal) {
  return (deal.brand_name || "").trim() || "Unspecified Brand";
}
function agencyNameOf(deal) {
  return (deal.agency_name || "").trim() || "Unspecified Agency";
}

function distinctSorted(deals, getter) {
  return [...new Set(deals.map(getter))].sort((a, b) => a.localeCompare(b));
}

function matchesFilters(deal, filters) {
  if (filters.type.size && !filters.type.has(typeKeyOf(deal))) return false;
  if (filters.status.size && !filters.status.has(deal.deal_status)) return false;
  if (filters.show.size && !filters.show.has(showNameOf(deal))) return false;
  if (filters.brand.size && !filters.brand.has(brandNameOf(deal))) return false;
  if (filters.agency.size && !filters.agency.has(agencyNameOf(deal))) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const fullMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtMoney(n) {
  if (n == null || Number.isNaN(n)) return "$0";
  return compactMoney.format(n);
}
function fmtMoneyFull(n) {
  if (n == null || Number.isNaN(n)) return "$0";
  return fullMoney.format(n);
}
function fmtPercent(n) {
  if (n == null || Number.isNaN(n)) return "N/A";
  return `${n.toFixed(1)}%`;
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// A deal's margin dollars aren't stored directly, but total_investment and
// total_margin_percent are — derive dollars so every rollup below can use a
// single weighted formula: sum(marginDollar) / sum(investment).
function dealMarginDollar(deal) {
  return num(deal.total_investment) * (num(deal.total_margin_percent) / 100);
}
function dealCost(deal) {
  return num(deal.total_investment) - dealMarginDollar(deal);
}

function sumDeals(deals) {
  let investment = 0;
  let marginDollar = 0;
  for (const d of deals) {
    investment += num(d.total_investment);
    marginDollar += dealMarginDollar(d);
  }
  return {
    investment,
    marginDollar,
    marginPercent: investment > 0 ? (marginDollar / investment) * 100 : null,
    dealCount: deals.length,
  };
}

function aggregateBreakdown(deals, key) {
  let investment = 0;
  let marginDollar = 0;
  for (const d of deals) {
    const cat = d?.snapshot?.categoryBreakdown7?.[key];
    if (!cat) continue;
    investment += num(cat.investment);
    marginDollar += num(cat.marginDollar);
  }
  return {
    investment,
    marginDollar,
    marginPercent: investment > 0 ? (marginDollar / investment) * 100 : null,
  };
}

// Same idea as aggregateBreakdown above, generalized to either snapshot
// breakdown field — used by the combined-view panel for both
// categoryBreakdown4 and categoryBreakdown7 without duplicating the loop.
function aggregateCategoryBreakdown(deals, snapshotField, key) {
  let investment = 0;
  let marginDollar = 0;
  for (const d of deals) {
    const cat = d?.snapshot?.[snapshotField]?.[key];
    if (!cat) continue;
    investment += num(cat.investment);
    marginDollar += num(cat.marginDollar);
  }
  return {
    investment,
    marginDollar,
    marginPercent: investment > 0 ? (marginDollar / investment) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// Tree construction
// ---------------------------------------------------------------------------
function buildBreakdownNodes(deals, idPrefix) {
  return BREAKDOWN_ORDER.map((b) => {
    const agg = aggregateBreakdown(deals, b.key);
    return {
      id: `${idPrefix}|bd:${b.key}`,
      kind: "breakdown",
      label: b.label,
      investment: agg.investment,
      marginPercent: b.noMargin ? null : agg.marginPercent,
      noMargin: !!b.noMargin,
      accent: TEAL,
      children: null,
    };
  });
}

function buildStatusNodes(deals, idPrefix) {
  return STATUS_ORDER.map((s) => {
    const statusDeals = deals.filter((d) => d.deal_status === s.key);
    const agg = sumDeals(statusDeals);
    return {
      id: `${idPrefix}|st:${s.key}`,
      kind: "status",
      label: s.label,
      investment: agg.investment,
      marginPercent: agg.marginPercent,
      dealCount: agg.dealCount,
      accent: s.accent,
      children: buildBreakdownNodes(statusDeals, `${idPrefix}|st:${s.key}`),
    };
  });
}

function buildShowNodes(deals, idPrefix) {
  const groups = new Map();
  for (const d of deals) {
    const name = (d.tentpole_show_name || "").trim() || "Unspecified Show";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(d);
  }
  const shows = [...groups.entries()].map(([name, showDeals]) => {
    const agg = sumDeals(showDeals);
    const id = `cat:tentpole|show:${name}`;
    return {
      id,
      kind: "show",
      label: name,
      investment: agg.investment,
      marginPercent: agg.marginPercent,
      dealCount: agg.dealCount,
      accent: "#B8873B",
      children: buildStatusNodes(showDeals, id),
    };
  });
  shows.sort((a, b) => b.investment - a.investment);
  return shows;
}

function buildTree(deals) {
  return CATEGORY_ORDER.map((c) => {
    const catDeals = deals.filter((d) => {
      const raw = (d.deal_category || "").trim().toLowerCase();
      if (c.key === "uncategorized") {
        return !raw || !CATEGORY_ORDER.some((x) => x.key === raw);
      }
      return raw === c.key;
    });
    const agg = sumDeals(catDeals);
    const id = `cat:${c.key}`;
    return {
      id,
      kind: "category",
      label: c.label,
      investment: agg.investment,
      marginPercent: agg.marginPercent,
      dealCount: agg.dealCount,
      accent: c.accent,
      children:
        c.key === "tentpole"
          ? buildShowNodes(catDeals, id)
          : buildStatusNodes(catDeals, id),
    };
  });
}

function collectExpandableIds(nodes, acc) {
  for (const n of nodes) {
    if (n.children && n.children.length > 0) {
      acc.push(n.id);
      collectExpandableIds(n.children, acc);
    }
  }
  return acc;
}

// ---------------------------------------------------------------------------
// UI bits
// ---------------------------------------------------------------------------
const LEVEL_WEIGHT = { category: 650, show: 600, status: 550, breakdown: 400 };
const LEVEL_SIZE = { category: 14.5, show: 13.5, status: 13, breakdown: 12.5 };
const LEVEL_COLOR = { category: INK, show: INK, status: "#3A423F", breakdown: "#5B6B66" };

function MarginBar({ percent, noMargin }) {
  if (noMargin) {
    return <span style={{ color: "#9B968A", fontSize: 12.5 }}>N/A</span>;
  }
  if (percent == null) {
    return <span style={{ color: "#9B968A", fontSize: 12.5 }}>—</span>;
  }
  const width = Math.max(0, Math.min(100, (percent / 50) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: "#E9E6DC",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            background: TEAL,
            borderRadius: 3,
          }}
        />
      </div>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: 12.5,
          fontWeight: 600,
          color: INK,
          minWidth: 44,
          textAlign: "right",
        }}
      >
        {fmtPercent(percent)}
      </span>
    </div>
  );
}

function TreeRow({ node, depth, expanded, onToggle }) {
  const hasChildren = !!(node.children && node.children.length > 0);
  const isOpen = expanded.has(node.id);

  return (
    <>
      <div
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : -1}
        onClick={hasChildren ? () => onToggle(node.id) : undefined}
        onKeyDown={
          hasChildren
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(node.id);
                }
              }
            : undefined
        }
        className="row"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 84px 118px 190px",
          alignItems: "center",
          gap: 10,
          padding: "9px 14px 9px 0",
          paddingLeft: 14 + depth * 22,
          borderBottom: `1px solid ${LINE}`,
          cursor: hasChildren ? "pointer" : "default",
          background: node.kind === "category" ? "#FBFAF7" : "transparent",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "#8A8378",
            }}
          >
            {hasChildren ? (
              isOpen ? (
                <ChevronDown size={15} strokeWidth={2.25} />
              ) : (
                <ChevronRight size={15} strokeWidth={2.25} />
              )
            ) : null}
          </span>
          <span
            style={{
              width: 3,
              height: 15,
              borderRadius: 2,
              background: node.accent,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontWeight: LEVEL_WEIGHT[node.kind],
              fontSize: LEVEL_SIZE[node.kind],
              color: LEVEL_COLOR[node.kind],
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={node.label}
          >
            {node.label}
          </span>
        </div>

        <div style={{ fontSize: 12.5, color: "#8A8378", textAlign: "right" }}>
          {node.dealCount != null ? `${node.dealCount} deal${node.dealCount === 1 ? "" : "s"}` : ""}
        </div>

        <div
          style={{
            fontVariantNumeric: "tabular-nums",
            fontSize: 13,
            fontWeight: node.kind === "breakdown" ? 500 : 650,
            color: INK,
            textAlign: "right",
          }}
          title={fmtMoneyFull(node.investment)}
        >
          {fmtMoney(node.investment)}
        </div>

        <MarginBar percent={node.marginPercent} noMargin={node.noMargin} />
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} />
          ))}
        </div>
      )}
    </>
  );
}

const TALENT_PLACEMENT_TYPES = ["TALENT_PRODUCTION", "EXPERIENTIAL_FEE", "EXPERIENTIAL_BUILDOUT", "INTEGRATION_FEE", "INTEGRATION_BUILDOUT", "IP_LICENSING"];
const MEDIA_PLACEMENT_TYPES = ["PAID_MEDIA", "CUSTOM_SOCIAL", "SOCIAL_VIDEO", "DIGITAL_OO", "LINEAR_OO"];

// Mirrors the Media Planner's own renderPackageDetailsTab math exactly, so
// the dashboard's drill-down shows the same talent/media split the planner
// itself would show — just reading it from the synced `accounting` object
// instead of live in-app package state.
function computePackageAccounting(pkg) {
  const acc = pkg.accounting || {};
  const type = pkg.type;
  const platformAllocations = acc.platformAllocations || [];
  const blendedPlatforms = acc.blendedPlatforms || [];
  const hasMedia = platformAllocations.length > 0 || blendedPlatforms.length > 0;
  const hasTalent = num(acc.talentInvestment) > 0 || num(acc.talentCost) > 0;

  let talentCostAmount = num(acc.talentCost);
  let mediaCostAmount = 0;

  if (platformAllocations.length > 0) {
    mediaCostAmount = platformAllocations.reduce((s, a) => s + num(a.totalCost), 0);
  } else if (type === "branded-blended") {
    mediaCostAmount = num(pkg.cost) - talentCostAmount;
  } else if (type === "added-value") {
    if (acc.addedValueType === "talent") {
      talentCostAmount = num(pkg.cost);
      mediaCostAmount = 0;
    } else {
      talentCostAmount = 0;
      mediaCostAmount = num(pkg.cost);
    }
  } else if (type === "brand-funded-content") {
    talentCostAmount = 0;
    mediaCostAmount = 0;
  } else {
    mediaCostAmount = num(pkg.cost) - talentCostAmount;
  }

  let talentInvestmentAmount = num(acc.talentInvestment);
  let mediaInvestmentAmount = num(acc.mediaInvestmentDollar);
  if (type === "branded-blended" || type === "partnership") {
    // Neither package type tracks a separate "investment" figure for its
    // media/rev-share side — by the same convention the planner's own
    // categorization uses, investment = cost for the talent portion, and
    // the remainder of total investment falls to media/rev-share.
    talentInvestmentAmount = talentCostAmount;
    mediaInvestmentAmount = num(pkg.investment) - talentCostAmount;
  }
  const revSharePercent = type === "partnership" ? num(acc.revShare || 50) : null;

  let sponsorshipTalentCost = 0;
  let sponsorshipMediaCost = 0;
  const isDetailedSponsorship = type === "sponsorship" && acc.sponsorshipType === "detailed" && (acc.sponsorshipLineItems || []).length > 0;
  if (isDetailedSponsorship) {
    for (const item of acc.sponsorshipLineItems) {
      if (TALENT_PLACEMENT_TYPES.includes(item.placementType)) sponsorshipTalentCost += num(item.totalCost);
      else if (MEDIA_PLACEMENT_TYPES.includes(item.placementType)) sponsorshipMediaCost += num(item.totalCost);
      else if (item.placementType === "ADDED_VALUE") {
        if (item.addedValueSubType === "talent") sponsorshipTalentCost += num(item.totalCost);
        else sponsorshipMediaCost += num(item.totalCost);
      }
    }
  }

  return {
    acc, hasMedia, hasTalent, isDetailedSponsorship, revSharePercent,
    talentCostAmount, mediaCostAmount, talentInvestmentAmount, mediaInvestmentAmount,
    sponsorshipTalentCost, sponsorshipMediaCost,
    platformAllocations, blendedPlatforms,
  };
}

function hasAccountingDetail(pkg) {
  const acc = pkg.accounting;
  if (!acc) return false;
  return (
    num(acc.talentInvestment) > 0 || num(acc.talentCost) > 0 ||
    num(acc.mediaInvestmentDollar) > 0 ||
    (acc.platformAllocations || []).length > 0 ||
    (acc.blendedPlatforms || []).length > 0 ||
    (acc.sponsorshipLineItems || []).length > 0 ||
    num(acc.totalValue) > 0 || !!acc.addedValueType
  );
}
function KVRow({ label, value, indent, bold, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", paddingLeft: indent ? 14 : 0 }}>
      <span style={{ fontSize: 12, color: indent ? "#5B6B66" : "#3A423F", fontWeight: bold ? 650 : 400 }}>{label}</span>
      <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", fontWeight: bold ? 650 : 500, color: accent || INK }}>{value}</span>
    </div>
  );
}

function PackageAccountingDetail({ pkg }) {
  const type = pkg.type;
  const {
    acc, hasMedia, hasTalent, isDetailedSponsorship, revSharePercent,
    talentCostAmount, mediaCostAmount, talentInvestmentAmount, mediaInvestmentAmount,
    sponsorshipTalentCost, sponsorshipMediaCost, platformAllocations, blendedPlatforms,
  } = computePackageAccounting(pkg);

  const isBlended = type === "branded-blended";
  const isPartnership = type === "partnership";
  const marginDollar = num(pkg.investment) - num(pkg.cost);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Main accounting rows */}
      <div style={{ borderBottom: `1px solid ${LINE}`, paddingBottom: 8 }}>
        {type === "added-value" ? (
          <>
            <KVRow label="Client Price" value={fmtMoneyFull(num(pkg.investment))} bold />
            <KVRow label="Value Provided" value={fmtMoneyFull(num(acc.totalValue))} bold accent={TEAL} />
            {acc.addedValueType === "talent" && (
              <>
                <KVRow label="Production & Talent Cost" indent value={fmtMoneyFull(talentCostAmount)} />
                <KVRow label="Total Cost" value={fmtMoneyFull(num(pkg.cost))} bold />
              </>
            )}
            {acc.addedValueType === "distribution" && (
              <>
                <KVRow label="Impressions" indent value={num(acc.impressions).toLocaleString()} />
                <KVRow label="CPM Cost" indent value={`$${num(acc.cpmCost).toFixed(2)}`} />
                <KVRow label="CPM Price" indent value={`$${num(acc.cpmPrice).toFixed(2)}`} />
                <KVRow label="Media Cost" indent value={fmtMoneyFull(mediaCostAmount)} />
                <KVRow label="Total Cost" value={fmtMoneyFull(num(pkg.cost))} bold />
              </>
            )}
            {acc.addedValueType === "streaming" && (
              <>
                <KVRow label="Impressions" indent value={num(acc.impressions).toLocaleString()} />
                <KVRow label="CPM Price" indent value={`$${num(acc.cpmPrice).toFixed(2)}`} />
              </>
            )}
          </>
        ) : (
          <>
            <KVRow label="Total Investment" value={fmtMoneyFull(num(pkg.investment))} bold />
            {isDetailedSponsorship && (
              <>
                <KVRow label="Production & Talent Cost (Internal)" indent value={fmtMoneyFull(sponsorshipTalentCost)} />
                <KVRow label="Media Cost (Internal)" indent value={fmtMoneyFull(sponsorshipMediaCost)} />
              </>
            )}
            {hasTalent && type !== "sponsorship" && (
              <>
                <KVRow label="Production & Talent Investment" indent value={fmtMoneyFull(talentInvestmentAmount)} />
                <KVRow label="Production & Talent Cost" indent value={fmtMoneyFull(talentCostAmount)} />
              </>
            )}
            {(hasMedia || isBlended || isPartnership) && type !== "sponsorship" && (
              <>
                <KVRow
                  label={isPartnership ? "Rev Share Investment" : "Media Investment"}
                  indent
                  value={fmtMoneyFull(mediaInvestmentAmount)}
                />
                <KVRow
                  label={isPartnership ? `Rev Share Cost (${revSharePercent}%)` : "Media Cost"}
                  indent
                  value={fmtMoneyFull(mediaCostAmount)}
                />
              </>
            )}
            <KVRow label={`Total Cost${type === "sponsorship" ? " (Internal)" : ""}`} value={fmtMoneyFull(num(pkg.cost))} bold />
            <KVRow
              label="Total Margin"
              value={`${fmtMoneyFull(marginDollar)} (${fmtPercent(num(pkg.marginPercent))})`}
              bold
              accent={TEAL}
            />
          </>
        )}
      </div>

      {/* Media placements */}
      {(hasMedia || isBlended) && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 650, color: "#8A8378", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
            Media Placements
          </div>
          {isBlended ? (
            <div style={{ fontSize: 12, color: "#3A423F" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 120px", gap: 10, fontSize: 10.5, fontWeight: 650, color: "#9B968A", textTransform: "uppercase", padding: "3px 0" }}>
                <div>Platform</div>
                <div style={{ textAlign: "right" }}>Impressions</div>
                <div style={{ textAlign: "right" }}>Media Budget</div>
                <div style={{ textAlign: "right" }}>Cost CPM</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 120px", gap: 10, fontSize: 12, padding: "3px 0" }}>
                <div style={{ fontWeight: 600 }}>See notes for platform list</div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(acc.impressions).toLocaleString()}</div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoneyFull(mediaCostAmount)}</div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  ${(num(acc.impressions) > 0 ? (mediaCostAmount / num(acc.impressions)) * 1000 : num(acc.cpmCost)).toFixed(2)}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 120px 90px 120px 110px 90px", gap: 8, fontSize: 10.5, fontWeight: 650, color: "#9B968A", textTransform: "uppercase", padding: "3px 0", minWidth: 720 }}>
                <div>Platform</div>
                <div>Media Type</div>
                <div>Handle</div>
                <div style={{ textAlign: "right" }}>Investment</div>
                <div style={{ textAlign: "right" }}>Price CPM</div>
                <div style={{ textAlign: "right" }}>Impressions</div>
                <div style={{ textAlign: "right" }}>Media Budget</div>
                <div style={{ textAlign: "right" }}>Margin %</div>
              </div>
              {platformAllocations.map((a, i) => {
                const investment = num(acc.mediaInvestmentDollar) * (num(a.percentage) / 100);
                const priceCPM = num(a.impressions) > 0 ? (investment / num(a.impressions)) * 1000 : 0;
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 120px 90px 120px 110px 90px", gap: 8, fontSize: 12, padding: "3px 0", minWidth: 720 }}>
                    <div style={{ fontWeight: 600 }}>{a.platform}</div>
                    <div style={{ color: "#5B6B66" }}>{a.mediaType}</div>
                    <div style={{ color: "#5B6B66" }}>{a.handleType === "paramount" ? "Paramount" : "Influencer"}</div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoneyFull(investment)}</div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${priceCPM.toFixed(2)}</div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(a.impressions).toLocaleString()}</div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoneyFull(num(a.totalCost))}</div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtPercent(num(a.marginPercent))}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sponsorship line items */}
      {isDetailedSponsorship && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 650, color: "#8A8378", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
            Sponsorship Line Items
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 110px 120px", gap: 10, fontSize: 10.5, fontWeight: 650, color: "#9B968A", textTransform: "uppercase", padding: "3px 0" }}>
            <div>Placement</div>
            <div style={{ textAlign: "right" }}>Investment</div>
            <div style={{ textAlign: "right" }}>Cost</div>
          </div>
          {(acc.sponsorshipLineItems || []).map((item, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 110px 120px", gap: 10, fontSize: 12, padding: "3px 0" }}>
              <div style={{ color: "#3A423F" }}>{item.placementLabel}</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoneyFull(num(item.investment))}</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoneyFull(num(item.totalCost))}</div>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {(pkg.notes || (isBlended && blendedPlatforms.length > 0)) && (
        <div style={{ background: "#EAF0EC", borderLeft: `3px solid ${TEAL}`, borderRadius: 6, padding: "8px 10px" }}>
          <div style={{ fontSize: 11, fontWeight: 650, color: TEAL, marginBottom: 4 }}>Notes</div>
          <div style={{ fontSize: 12, color: "#3A423F", whiteSpace: "pre-wrap" }}>
            {pkg.notes || ""}
            {isBlended && blendedPlatforms.length > 0 && (
              <>
                {pkg.notes ? "\n\n" : ""}
                Distribution Platforms:
                {blendedPlatforms.map((p, i) => (
                  <div key={i}>• {p.platform} - {p.mediaType} ({p.handleType === "paramount" ? "Paramount" : "Influencer"})</div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MultiSelectFilter({ label, options, selected, onToggle, onClearOne }) {
  const [open, setOpen] = useState(false);
  const count = selected.size;
  return (
    <div style={{ position: "relative" }}>
      <button
        className="ctrl"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: count ? TEAL : "#FFFFFF",
          color: count ? "#FFFFFF" : INK,
          border: `1px solid ${count ? TEAL : LINE}`,
          borderRadius: 7,
          padding: "6px 10px",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {label}
        {count > 0 && (
          <span
            style={{
              background: "#FFFFFF",
              color: TEAL,
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 700,
              padding: "0 6px",
              lineHeight: "16px",
            }}
          >
            {count}
          </span>
        )}
        <ChevronDown size={13} strokeWidth={2.25} />
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 10 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 11,
              background: "#FFFFFF",
              border: `1px solid ${LINE}`,
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(22,33,30,0.12)",
              minWidth: 210,
              maxHeight: 260,
              overflowY: "auto",
              padding: 6,
            }}
          >
            {options.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 12.5, color: "#9B968A" }}>No options</div>
            )}
            {options.map((opt) => {
              const isChecked = selected.has(opt.value);
              return (
                <label
                  key={opt.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F0EEE6")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggle(opt.value)}
                    style={{ accentColor: TEAL }}
                  />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
            {count > 0 && (
              <button
                className="ctrl"
                onClick={onClearOne}
                style={{ ...ctrlBtnStyle, padding: "6px 8px", fontSize: 12 }}
              >
                Clear {label.toLowerCase()}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FilterBar({ deals, filters, setFilters }) {
  const typeOptions = CATEGORY_ORDER.map((c) => ({ value: c.key, label: c.label }));
  const statusOptions = STATUS_ORDER.map((s) => ({ value: s.key, label: s.label }));
  const showOptions = useMemo(
    () => distinctSorted(deals, showNameOf).map((v) => ({ value: v, label: v })),
    [deals]
  );
  const brandOptions = useMemo(
    () => distinctSorted(deals, brandNameOf).map((v) => ({ value: v, label: v })),
    [deals]
  );
  const agencyOptions = useMemo(
    () => distinctSorted(deals, agencyNameOf).map((v) => ({ value: v, label: v })),
    [deals]
  );

  const toggle = (dim, value) =>
    setFilters((prev) => {
      const next = { ...prev, [dim]: new Set(prev[dim]) };
      next[dim].has(value) ? next[dim].delete(value) : next[dim].add(value);
      return next;
    });
  const clearOne = (dim) =>
    setFilters((prev) => ({ ...prev, [dim]: new Set() }));
  const clearAll = () =>
    setFilters({ type: new Set(), status: new Set(), show: new Set(), brand: new Set(), agency: new Set() });

  const totalActive = Object.values(filters).reduce((a, s) => a + s.size, 0);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
      <MultiSelectFilter label="Type" options={typeOptions} selected={filters.type} onToggle={(v) => toggle("type", v)} onClearOne={() => clearOne("type")} />
      <MultiSelectFilter label="Deal Category" options={statusOptions} selected={filters.status} onToggle={(v) => toggle("status", v)} onClearOne={() => clearOne("status")} />
      <MultiSelectFilter label="Show" options={showOptions} selected={filters.show} onToggle={(v) => toggle("show", v)} onClearOne={() => clearOne("show")} />
      <MultiSelectFilter label="Brand" options={brandOptions} selected={filters.brand} onToggle={(v) => toggle("brand", v)} onClearOne={() => clearOne("brand")} />
      <MultiSelectFilter label="Agency" options={agencyOptions} selected={filters.agency} onToggle={(v) => toggle("agency", v)} onClearOne={() => clearOne("agency")} />
      {totalActive > 0 && (
        <button className="ctrl" onClick={clearAll} style={{ ...ctrlBtnStyle, color: "#B33F3F" }}>
          Clear all filters
        </button>
      )}
    </div>
  );
}

function ActiveFilterChips({ filters, setFilters }) {
  const dims = [
    { key: "type", label: "Type", lookup: (v) => TYPE_LABELS[v]?.label || v },
    { key: "status", label: "Deal Category", lookup: (v) => STATUS_LABELS[v]?.label || v },
    { key: "show", label: "Show", lookup: (v) => v },
    { key: "brand", label: "Brand", lookup: (v) => v },
    { key: "agency", label: "Agency", lookup: (v) => v },
  ];
  const active = dims.filter((d) => filters[d.key].size > 0);
  if (active.length === 0) return null;

  const clearDim = (dim) => setFilters((prev) => ({ ...prev, [dim]: new Set() }));

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
      <span style={{ fontSize: 11.5, fontWeight: 650, color: "#8A8378", textTransform: "uppercase", letterSpacing: "0.03em" }}>
        Filtered by
      </span>
      {active.map((d) => (
        <span
          key={d.key}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#EAF0EC",
            border: `1px solid #C9DBCF`,
            color: TEAL,
            borderRadius: 20,
            padding: "4px 6px 4px 10px",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span>
            {d.label}: {[...filters[d.key]].map(d.lookup).join(", ")}
          </span>
          <button
            onClick={() => clearDim(d.key)}
            aria-label={`Clear ${d.label} filter`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              color: TEAL,
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
              fontSize: 13,
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flat table (row per deal, expandable to breakdown detail)
// ---------------------------------------------------------------------------
function Badge({ text, accent }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 600,
        color: INK,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, flexShrink: 0 }} />
      {text}
    </span>
  );
}

// Shared renderer for a category/breakdown table — used for both the 4-category
// Investment Category Breakdown and the 7-category Investment Breakdown Beta,
// per-deal and (via CombinedBreakdownPanel) summed across the current view.
function CategoryBreakdownTable({ title, order, categoryData }) {
  const rows = order
    .map((b) => {
      const cat = categoryData?.[b.key];
      const investment = num(cat?.investment);
      const marginDollar = num(cat?.marginDollar);
      return {
        key: b.key,
        label: b.label,
        investment,
        cost: investment - marginDollar,
        marginDollar,
        marginPercent: b.noMargin ? null : investment > 0 ? (marginDollar / investment) * 100 : null,
        noMargin: !!b.noMargin,
      };
    })
    .filter((r) => r.investment > 0 || r.noMargin);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 650, color: "#8A8378", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#9B968A" }}>No breakdown detail on this deal.</div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 140px 140px 140px 90px",
              gap: 10,
              fontSize: 11,
              fontWeight: 650,
              color: "#8A8378",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
              padding: "4px 0 6px",
            }}
          >
            <div>Breakdown</div>
            <div style={{ textAlign: "right" }}>Investment $</div>
            <div style={{ textAlign: "right" }}>Cost $</div>
            <div style={{ textAlign: "right" }}>Margin $</div>
            <div style={{ textAlign: "right" }}>Margin %</div>
          </div>
          {rows.map((r) => (
            <div
              key={r.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 140px 140px 140px 90px",
                gap: 10,
                fontSize: 12.5,
                padding: "4px 0",
              }}
            >
              <div style={{ color: "#3A423F" }}>{r.label}</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoneyFull(r.investment)}</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#5B6B66" }}>
                {r.noMargin ? "—" : fmtMoneyFull(r.cost)}
              </div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: TEAL, fontWeight: 600 }}>
                {r.noMargin ? "—" : fmtMoneyFull(r.marginDollar)}
              </div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {r.noMargin ? "N/A" : fmtPercent(r.marginPercent)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function FlatRow({ deal, isOpen, onToggle }) {
  const investment = num(deal.total_investment);
  const cost = dealCost(deal);
  const marginDollar = dealMarginDollar(deal);
  const marginPercent = num(deal.total_margin_percent);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="row"
        style={{
          display: "grid",
          gridTemplateColumns: "22px 1.6fr 165px 165px 165px 110px",
          alignItems: "center",
          gap: 10,
          padding: "9px 14px",
          borderBottom: `1px solid ${LINE}`,
          cursor: "pointer",
        }}
      >
        <span style={{ color: "#8A8378", display: "flex" }}>
          {isOpen ? <ChevronDown size={14} strokeWidth={2.25} /> : <ChevronRight size={14} strokeWidth={2.25} />}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
          <span
            style={{
              fontWeight: 600,
              fontSize: 13.5,
              color: INK,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flexShrink: 1,
            }}
            title={deal.project_name}
          >
            {deal.project_name || "Untitled Project"}
          </span>
          <Badge
            text={(STATUS_LABELS[deal.deal_status] || { label: deal.deal_status || "—" }).label}
            accent={(STATUS_LABELS[deal.deal_status] || { accent: "#9B968A" }).accent}
          />
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 650, textAlign: "right" }}>
          {fmtMoneyFull(investment)}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, color: "#5B6B66", textAlign: "right" }}>
          {fmtMoneyFull(cost)}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 600, color: TEAL, textAlign: "right" }}>
          {fmtMoneyFull(marginDollar)}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 650, textAlign: "right" }}>
          {fmtPercent(marginPercent)}
        </span>
      </div>

      {isOpen && (
        <div style={{ padding: "10px 14px 14px 46px", background: "#FBFAF7", borderBottom: `1px solid ${LINE}` }}>
          <CategoryBreakdownTable
            title="Investment Category Breakdown"
            order={CATEGORY4_ORDER}
            categoryData={deal?.snapshot?.categoryBreakdown4}
          />
          <CategoryBreakdownTable
            title="Investment Breakdown Beta"
            order={BREAKDOWN_ORDER}
            categoryData={deal?.snapshot?.categoryBreakdown7}
          />

          <PackageDrilldown deal={deal} />
        </div>
      )}
    </>
  );
}

// Per-campaign package drill-down. Uses snapshot.packages[] (title, type,
// investment, cost, margin) which every synced deal already has. If a
// package also carries its own categoryBreakdown7 (added by the Media
// Planner's snapshot capture), each package row expands further into the
// same Investment Breakdown matrix shown in the planner app itself.
function PackageDrilldown({ deal }) {
  const [openPkg, setOpenPkg] = useState(new Set());
  const packages = deal?.snapshot?.packages || [];

  if (packages.length === 0) {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 650, color: "#8A8378", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
          Packages
        </div>
        <div style={{ fontSize: 12.5, color: "#9B968A" }}>
          No package-level detail was captured for this deal.
        </div>
      </div>
    );
  }

  const togglePkg = (i) =>
    setOpenPkg((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 650, color: "#8A8378", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
        Packages
      </div>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden", background: "#FFFFFF" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "18px 1.3fr 1fr 130px 130px 130px 80px",
            gap: 10,
            padding: "7px 10px",
            background: "#EFEDE5",
            fontSize: 10.5,
            fontWeight: 650,
            color: "#5B6B66",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          <div />
          <div>Package</div>
          <div>Type</div>
          <div style={{ textAlign: "right" }}>Investment $</div>
          <div style={{ textAlign: "right" }}>Cost $</div>
          <div style={{ textAlign: "right" }}>Margin $</div>
          <div style={{ textAlign: "right" }}>Margin %</div>
        </div>
        {packages.map((pkg, i) => (
          <PackageRow key={i} pkg={pkg} index={i} isOpen={openPkg.has(i)} onToggle={() => togglePkg(i)} />
        ))}
      </div>
    </div>
  );
}

function PackageRow({ pkg, index, isOpen, onToggle }) {
  const [subTab, setSubTab] = useState("accounting"); // "accounting" | "category"
  const hasCatSplit = pkg.categoryBreakdown7 && Object.keys(pkg.categoryBreakdown7).length > 0;
  const hasDeepDetail = hasCatSplit || hasAccountingDetail(pkg);

  return (
    <React.Fragment>
      <div
        role={hasDeepDetail ? "button" : undefined}
        tabIndex={hasDeepDetail ? 0 : -1}
        onClick={hasDeepDetail ? onToggle : undefined}
        onKeyDown={hasDeepDetail ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } } : undefined}
        style={{
          display: "grid",
          gridTemplateColumns: "18px 1.3fr 1fr 130px 130px 130px 80px",
          gap: 10,
          padding: "7px 10px",
          borderTop: index > 0 ? `1px solid ${LINE}` : "none",
          fontSize: 12.5,
          cursor: hasDeepDetail ? "pointer" : "default",
        }}
      >
        <span style={{ color: "#8A8378", display: "flex" }}>
          {hasDeepDetail ? (isOpen ? <ChevronDown size={12} strokeWidth={2.25} /> : <ChevronRight size={12} strokeWidth={2.25} />) : null}
        </span>
        <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pkg.title}>
          {pkg.title || "Untitled Package"}
        </span>
        <span style={{ color: "#5B6B66", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pkg.typeLabel}>
          {pkg.typeLabel || pkg.type || "—"}
        </span>
        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoneyFull(num(pkg.investment))}</span>
        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#5B6B66" }}>{fmtMoneyFull(num(pkg.cost))}</span>
        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: TEAL, fontWeight: 600 }}>{fmtMoneyFull(num(pkg.marginDollar))}</span>
        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtPercent(num(pkg.marginPercent))}</span>
      </div>

      {hasDeepDetail && isOpen && (
        <div style={{ padding: "10px 10px 12px 34px", background: "#FBFAF7", borderTop: `1px solid ${LINE}` }}>
          {hasCatSplit && hasAccountingDetail(pkg) && (
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {[
                { key: "accounting", label: "How It's Accounted For" },
                { key: "category", label: "Category Split" },
              ].map((t) => (
                <button
                  key={t.key}
                  className="ctrl"
                  onClick={() => setSubTab(t.key)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontWeight: 650,
                    cursor: "pointer",
                    border: `1px solid ${subTab === t.key ? TEAL : LINE}`,
                    background: subTab === t.key ? TEAL : "#FFFFFF",
                    color: subTab === t.key ? "#FFFFFF" : "#5B6B66",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {(!hasCatSplit || subTab === "accounting") && hasAccountingDetail(pkg) && <PackageAccountingDetail pkg={pkg} />}
          {(!hasAccountingDetail(pkg) || subTab === "category") && hasCatSplit && (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 120px 120px 120px 80px",
                  gap: 10,
                  fontSize: 10.5,
                  fontWeight: 650,
                  color: "#9B968A",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  padding: "3px 0 5px",
                }}
              >
                <div>Category</div>
                <div style={{ textAlign: "right" }}>Investment $</div>
                <div style={{ textAlign: "right" }}>Cost $</div>
                <div style={{ textAlign: "right" }}>Margin $</div>
                <div style={{ textAlign: "right" }}>Margin %</div>
              </div>
              {Object.entries(pkg.categoryBreakdown7).map(([key, cat]) => (
                <div
                  key={key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 120px 120px 120px 80px",
                    gap: 10,
                    fontSize: 12,
                    padding: "3px 0",
                  }}
                >
                  <div style={{ color: "#3A423F" }}>{cat.label || key}</div>
                  <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoneyFull(num(cat.investment))}</div>
                  <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#5B6B66" }}>
                    {cat.cost == null ? "—" : fmtMoneyFull(num(cat.cost))}
                  </div>
                  <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: TEAL, fontWeight: 600 }}>
                    {cat.cost == null ? "—" : fmtMoneyFull(num(cat.marginDollar))}
                  </div>
                  <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {cat.cost == null ? "N/A" : fmtPercent(num(cat.marginPercent))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </React.Fragment>
  );
}

function FlatTable({ deals }) {
  const [openIds, setOpenIds] = useState(new Set());
  const sorted = useMemo(
    () => [...deals].sort((a, b) => num(b.total_investment) - num(a.total_investment)),
    [deals]
  );
  const toggle = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", background: "#FFFFFF" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "22px 1.6fr 165px 165px 165px 110px",
          gap: 10,
          padding: "10px 14px",
          background: "#000A3C",
          color: "#FFFFFF",
          fontSize: 11,
          fontWeight: 650,
          textTransform: "uppercase",
        }}
      >
        <div />
        <div>Project</div>
        <div style={{ textAlign: "right" }}>Investment $</div>
        <div style={{ textAlign: "right" }}>Cost $</div>
        <div style={{ textAlign: "right" }}>Margin $</div>
        <div style={{ textAlign: "right" }}>Margin %</div>
      </div>

      {sorted.length === 0 ? (
        <div style={{ padding: "28px 14px", color: "#8A8378", fontSize: 13.5 }}>
          No deals match the current filters.
        </div>
      ) : (
        sorted.map((d, i) => (
          <FlatRow key={`${d.project_name}-${i}`} deal={d} isOpen={openIds.has(i)} onToggle={() => toggle(i)} />
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut chart — hand-rolled SVG, no charting library (matching this file's
// existing no-dependency convention for icons). Slice order/colors are fixed
// by category identity (BREAKDOWN_COLORS), not by size, so filtering the
// deal set never repaints a surviving category's color.
// ---------------------------------------------------------------------------
function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeDonutSlice(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const startOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const startInner = polarToCartesian(cx, cy, rInner, endAngle);
  const endInner = polarToCartesian(cx, cy, rInner, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

// Picks readable label ink for a given wedge fill (white on darker/saturated
// hues, ink on the lighter ones) — labels never inherit the series color itself.
function textColorForFill(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? INK : "#FFFFFF";
}

// Only large-enough slices get a direct label inside the ring — smaller ones
// rely on the legend and the native SVG tooltip (<title>) instead of
// crowding the chart with unreadable text (dataviz skill: "label
// selectively, never a number on every point").
const DONUT_LABEL_THRESHOLD_PCT = 8;

function InvestmentDonut({ rows, colors, size = 190 }) {
  const total = rows.reduce((s, r) => s + r.investment, 0);
  if (total <= 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;
  const rInner = rOuter * 0.58;

  let cursor = 0;
  const slices = rows.map((r) => {
    const pct = (r.investment / total) * 100;
    const startAngle = (cursor / total) * 360;
    cursor += r.investment;
    const endAngle = (cursor / total) * 360;
    const midAngle = (startAngle + endAngle) / 2;
    const labelPos = polarToCartesian(cx, cy, (rOuter + rInner) / 2, midAngle);
    return { ...r, pct, startAngle, endAngle, labelPos, fill: colors[r.key] || "#9B968A" };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg width={size} height={size} role="img" aria-label="Investment breakdown by category, as a percent of total investment">
        {slices.map((s) => (
          <path
            key={s.key}
            d={describeDonutSlice(cx, cy, rOuter, rInner, s.startAngle, s.endAngle)}
            fill={s.fill}
            stroke="#FFFFFF"
            strokeWidth={3}
          >
            <title>{`${s.label}: ${fmtMoneyFull(s.investment)} (${s.pct.toFixed(1)}%)`}</title>
          </path>
        ))}
        {slices
          .filter((s) => s.pct >= DONUT_LABEL_THRESHOLD_PCT)
          .map((s) => (
            <text
              key={`label-${s.key}`}
              x={s.labelPos.x}
              y={s.labelPos.y}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 12, fontWeight: 650, fill: textColorForFill(s.fill), pointerEvents: "none" }}
            >
              {`${s.pct.toFixed(0)}%`}
            </text>
          ))}
        <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontSize: 10, fontWeight: 650, fill: "#8A8378", letterSpacing: "0.03em" }}>
          TOTAL
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" style={{ fontSize: 15, fontWeight: 700, fill: INK }}>
          {fmtMoney(total)}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {slices.map((s) => (
          <div key={`legend-${s.key}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.fill, flexShrink: 0 }} />
            <span style={{ color: "#3A423F", fontWeight: 600 }}>{s.label}</span>
            <span style={{ color: "#8A8378" }}>{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Combined breakdown panel — both category tables summed across whatever's
// currently in view (i.e. respecting the active Type/Show/Brand/Agency
// filters), rather than a manual per-deal selection. "The user's view" here
// means the filtered set, since that's already how every other rollup on
// this dashboard (the stat strip, the Tree view) treats "in view."
// ---------------------------------------------------------------------------
function CombinedBreakdownTable({ title, order, deals, snapshotField, colors }) {
  const rows = order
    .map((b) => {
      const agg = aggregateCategoryBreakdown(deals, snapshotField, b.key);
      return {
        key: b.key,
        label: b.label,
        investment: agg.investment,
        cost: agg.investment - agg.marginDollar,
        marginDollar: agg.marginDollar,
        marginPercent: b.noMargin ? null : agg.marginPercent,
        noMargin: !!b.noMargin,
      };
    })
    .filter((r) => r.investment > 0 || r.noMargin);

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 650, color: TEAL, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
        {title}
      </div>
      {colors && rows.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <InvestmentDonut rows={rows} colors={colors} />
        </div>
      )}
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#9B968A" }}>No deals in the current view have breakdown detail.</div>
      ) : (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden", background: "#FFFFFF" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 150px 150px 150px 100px",
              gap: 10,
              padding: "7px 12px",
              background: "#EFEDE5",
              fontSize: 10.5,
              fontWeight: 650,
              color: "#5B6B66",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            <div>Category</div>
            <div style={{ textAlign: "right" }}>Investment $</div>
            <div style={{ textAlign: "right" }}>Cost $</div>
            <div style={{ textAlign: "right" }}>Margin $</div>
            <div style={{ textAlign: "right" }}>Margin %</div>
          </div>
          {rows.map((r, i) => (
            <div
              key={r.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 150px 150px 150px 100px",
                gap: 10,
                padding: "7px 12px",
                fontSize: 12.5,
                borderTop: i > 0 ? `1px solid ${LINE}` : "none",
              }}
            >
              <div style={{ fontWeight: 600, color: "#3A423F" }}>{r.label}</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoneyFull(r.investment)}</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#5B6B66" }}>
                {r.noMargin ? "—" : fmtMoneyFull(r.cost)}
              </div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: TEAL, fontWeight: 600 }}>
                {r.noMargin ? "—" : fmtMoneyFull(r.marginDollar)}
              </div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {r.noMargin ? "N/A" : fmtPercent(r.marginPercent)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CombinedBreakdownPanel({ deals }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: "#FBFAF7", padding: "16px 16px 4px", marginBottom: 20 }}>
      <CombinedBreakdownTable
        title="Investment Category Breakdown (Combined)"
        order={CATEGORY4_ORDER}
        deals={deals}
        snapshotField="categoryBreakdown4"
      />
      <CombinedBreakdownTable
        title="Investment Breakdown Beta (Combined)"
        order={BREAKDOWN_ORDER}
        deals={deals}
        snapshotField="categoryBreakdown7"
        colors={BREAKDOWN_COLORS}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ExecSummaryDashboard() {
  const [deals, setDeals] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const [lastSynced, setLastSynced] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [view, setView] = useState("table"); // "table" | "tree"
  const [showCombined, setShowCombined] = useState(false);
  const [filters, setFilters] = useState({
    type: new Set(),
    status: new Set(),
    show: new Set(),
    brand: new Set(),
    agency: new Set(),
  });

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const json = await jsonpRequest(SANDBOX_API_URL, { action: "listClosedDeals" });
      setDeals(Array.isArray(json) ? json : []);
      setLastSynced(new Date());
      setStatus("ready");
    } catch (err) {
      setErrorMsg(err?.message || "Could not load deals.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredDeals = useMemo(() => deals.filter((d) => matchesFilters(d, filters)), [deals, filters]);
  const tree = useMemo(() => buildTree(filteredDeals), [filteredDeals]);
  const grandTotal = useMemo(() => sumDeals(filteredDeals), [filteredDeals]);

  const expandAll = () => setExpanded(new Set(collectExpandableIds(tree, [])));
  const collapseAll = () => setExpanded(new Set());
  const onToggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div
      style={{
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        background: PAPER,
        color: INK,
        minHeight: "100%",
        padding: "28px 20px 40px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&display=swap');
        .row:hover { background: #F0EEE6 !important; }
        .row:focus-visible { outline: 2px solid ${TEAL}; outline-offset: -2px; }
        button.ctrl:focus-visible { outline: 2px solid ${TEAL}; outline-offset: 2px; }
      `}</style>

      <div style={{ maxWidth: view === "table" ? 980 : 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              fontSize: 25,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: INK,
            }}
          >
            Closed Deals — Executive Summary
          </div>
          <div style={{ fontSize: 12.5, color: "#8A8378", marginTop: 3, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>Read-only view of {TABLE}</span>
            <span>·</span>
            <span>
              {lastSynced
                ? `Synced ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Not yet synced"}
            </span>
            <button
              className="ctrl"
              onClick={load}
              disabled={status === "loading"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "none",
                border: "none",
                color: TEAL,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {status === "loading" ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
              Refresh
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            background: LINE,
            border: `1px solid ${LINE}`,
            borderRadius: 10,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          {[
            { label: "Total Investment", value: fmtMoneyFull(grandTotal.investment) },
            { label: "Blended Margin %", value: fmtPercent(grandTotal.marginPercent) },
            { label: "Total Deals", value: String(grandTotal.dealCount) },
          ].map((s) => (
            <div key={s.label} style={{ background: "#FFFFFF", padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "#8A8378", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Combined category breakdown toggle */}
        {status === "ready" && deals.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <button
              className="ctrl"
              onClick={() => setShowCombined((v) => !v)}
              style={{
                ...ctrlBtnStyle,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {showCombined ? <ChevronDown size={13} strokeWidth={2.25} /> : <ChevronRight size={13} strokeWidth={2.25} />}
              {showCombined ? "Hide" : "Show"} Investment Category Breakdown (Combined)
            </button>
            {showCombined && <div style={{ marginTop: 12 }}><CombinedBreakdownPanel deals={filteredDeals} /></div>}
          </div>
        )}

        {/* View tabs + controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 4, background: "#EFEDE5", borderRadius: 8, padding: 3 }}>
            {[{ key: "table", label: "Table" }, { key: "tree", label: "Tree" }].map((t) => (
              <button
                key={t.key}
                className="ctrl"
                onClick={() => setView(t.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontWeight: 650,
                  cursor: "pointer",
                  border: "none",
                  background: view === t.key ? "#FFFFFF" : "transparent",
                  color: view === t.key ? INK : "#8A8378",
                  boxShadow: view === t.key ? "0 1px 3px rgba(22,33,30,0.15)" : "none",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {view === "tree" && (
            <div style={{ display: "flex", gap: 14 }}>
              <button className="ctrl" onClick={expandAll} style={ctrlBtnStyle}>Expand all</button>
              <button className="ctrl" onClick={collapseAll} style={ctrlBtnStyle}>Collapse all</button>
            </div>
          )}
        </div>

        {/* Filters */}
        {status === "ready" && deals.length > 0 && (
          <>
            <FilterBar deals={deals} filters={filters} setFilters={setFilters} />
            <ActiveFilterChips filters={filters} setFilters={setFilters} />
          </>
        )}

        {status === "loading" && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: "#FFFFFF", padding: "32px 14px", display: "flex", alignItems: "center", gap: 10, color: "#8A8378" }}>
            <Loader2 size={16} className="spin" /> Loading deals…
          </div>
        )}

        {status === "error" && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: "#FFFFFF", padding: "24px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#B33F3F" }}>
              <AlertCircle size={16} />
              <span style={{ fontSize: 13.5 }}>{errorMsg}</span>
            </div>
            <button
              className="ctrl"
              onClick={load}
              style={{ ...ctrlBtnStyle, alignSelf: "flex-start", border: `1px solid ${LINE}`, padding: "6px 12px", borderRadius: 6 }}
            >
              Retry
            </button>
          </div>
        )}

        {status === "ready" && deals.length === 0 && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: "#FFFFFF", padding: "28px 14px", color: "#8A8378", fontSize: 13.5 }}>
            No closed deals found in {TABLE}.
          </div>
        )}

        {status === "ready" && deals.length > 0 && view === "table" && (
          <FlatTable deals={filteredDeals} />
        )}

        {status === "ready" && deals.length > 0 && view === "tree" && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", background: "#FFFFFF" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 84px 118px 190px",
                gap: 10,
                padding: "10px 14px",
                background: TEAL,
                color: "#F1F0EA",
                fontSize: 11.5,
                fontWeight: 650,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              <div>Category / Show / Status / Breakdown</div>
              <div style={{ textAlign: "right" }}>Deals</div>
              <div style={{ textAlign: "right" }}>Investment $</div>
              <div style={{ textAlign: "right" }}>Margin %</div>
            </div>
            {tree.map((node) => (
              <TreeRow key={node.id} node={node} depth={0} expanded={expanded} onToggle={onToggle} />
            ))}
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 11.5, color: "#9B968A" }}>
          Margin % is always a weighted average — total margin dollars ÷ total investment dollars for every deal in the group.
        </div>
      </div>

      <style>{`
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
      `}</style>
    </div>
  );
}

const ctrlBtnStyle = {
  background: "none",
  border: "none",
  color: TEAL,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
};
