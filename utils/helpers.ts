import { ActionParams, PredictionResult, ActionCategory } from "../types";

const formatDateTime = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const m = d.getMonth() + 1;
  const date = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return {
    m,
    date,
    h,
    min,
    full: `${m}月${date}日 ${h}:${min}`,
    day: `${m}月${date}日`,
  };
};

const formatDateTimeRange = (startIso?: string, endIso?: string): string => {
  const start = formatDateTime(startIso);
  const end = formatDateTime(endIso);

  if (!start && !end) return "";
  if (start && !end) return typeof start === "string" ? start : start.full;
  if (!start && end) return typeof end === "string" ? end : end.full;

  // If either is a string (failed to parse), just join them
  if (typeof start === "string" || typeof end === "string")
    return `${start} 〜 ${end}`;
  if (!start || !end) return ""; // Typescript safety

  // Both are successful Date objects
  if (start.day === end.day) {
    return `${start.full} 〜 ${end.h}:${end.min}`;
  }
  return `${start.full} 〜 ${end.full}`;
};

export const generateGoogleCalendarUrl = (params: ActionParams): string => {
  const {
    calendarTitle,
    calendarStart,
    calendarEnd,
    calendarLocation,
    calendarDetails,
  } = params as any;
  const tel = String((params as any).tel ?? "").trim();
  const baseUrl = "https://www.google.com/calendar/render?action=TEMPLATE";

  let url = `${baseUrl}&text=${encodeURIComponent(
    calendarTitle || "Scheduled Action"
  )}`;

  if (calendarStart && calendarEnd) {
    const start = calendarStart.replace(/-|:|\.\d\d\d/g, "");
    const end = calendarEnd.replace(/-|:|\.\d\d\d/g, "");
    url += `&dates=${start}/${end}`;
  } else if (calendarStart) {
    const start = calendarStart.replace(/-|:|\.\d\d\d/g, "");
    url += `&dates=${start}/${start}`;
  }

  if (calendarLocation)
    url += `&location=${encodeURIComponent(calendarLocation)}`;

  const baseDetails = String(calendarDetails ?? "").trim();
  const withTel = tel
    ? baseDetails
      ? `${baseDetails}\nTEL: ${tel}`
      : `TEL: ${tel}`
    : baseDetails;

  if (withTel) url += `&details=${encodeURIComponent(withTel)}`;

  return url;
};

export const generateGoogleSearchUrl = (query: string): string => {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

export const generateGoogleMapsUrl = (query: string): string => {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query
  )}`;
};

const normalizeAiNotesForShare = (raw: string) => {
  const src = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!src) return "";

  const lines = src
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "")
    // 内部キー行だけ削除（英語キー + 日本語ラベル）
    .filter(
      (l) =>
        !/^\s*(date_no_year|time|end_date_no_year|end_time)\s*:/i.test(l) &&
        !/^\s*(日付（年不明）|日時（年不明）)\s*[:：]/.test(l)
    );

  // もしノイズ行しか無かった場合は空にする（補足ブロック自体を出さない）
  return lines.join("\n").trim();
};

export const generateLineShareUrl = (result: PredictionResult): string => {
  const { title, detail, params, category } = result;

  const {
    calendarStart,
    calendarEnd,
    calendarLocation,
    calendarDetails,
    url,
    calendarTitle,
    mapQuery,
    tel,
  } = params as any;

  // ResultCard側では (editable as any).aiNotes を持ってるので、ここでも拾う
  const aiNotesRaw = String((result as any).aiNotes ?? "").trim();
  const aiNotesForShare = normalizeAiNotesForShare(aiNotesRaw);

  const dateRange = formatDateTimeRange(calendarStart, calendarEnd);

  const normalizedTitle = (calendarTitle || title || "").trim();
  const normalizedDetail = (calendarDetails || detail || "").trim();
  const normalizedPlace = (calendarLocation || "").trim();
  const normalizedUrl = (url || "").trim();
  const normalizedTel = String(tel || "").trim();

  // EVENT/PLACE のときだけ、末尾に地図URLを付与する
  const isEventOrPlace =
    category === ActionCategory.Event || category === ActionCategory.Place;

  const mapSearchQuery = (
    String(mapQuery || "").trim() || normalizedPlace
  ).trim();
  const mapUrl =
    isEventOrPlace && mapSearchQuery
      ? generateGoogleMapsUrl(mapSearchQuery)
      : "";

  // 黄金フォーマット（絵文字）
  // 重要度が高い順に積む（aiNotesは価値が高いのでdetailより上）
  const lines: string[] = [];
  if (normalizedTitle) lines.push(`📌 ${normalizedTitle}`);
  if (dateRange) lines.push(`🗓️ ${dateRange}`);
  if (normalizedDetail) lines.push(`📝 ${normalizedDetail}`);
  if (normalizedPlace) lines.push(`📍 ${normalizedPlace}`);
  if (normalizedTel) lines.push(`☎️ ${normalizedTel}`);

  if (aiNotesForShare) {
    // 見出し＋内容（改行含む）
    lines.push(`📎 補足\n${aiNotesForShare}`);
  }

  if (normalizedUrl) lines.push(`🔗 ${normalizedUrl}`);

  // 一旦本文を作る（地図URLは最後に付与）
  let body = lines.join("\n").trim();

  // 末尾に地図URL（EVENT/PLACE 時のみ）
  const tail = mapUrl ? `\n🗺️ ${mapUrl}` : "";

  // 800文字制限：tail（地図URL）を優先して残す
  const LIMIT = 800;
  const reserved = tail.length;
  const availableForBody = Math.max(0, LIMIT - reserved);

  if (body.length > availableForBody) {
    const ellipsis = "...";
    const cut = Math.max(0, availableForBody - ellipsis.length);
    body = body.substring(0, cut) + ellipsis;
  }

  const messageText = (body + tail).trim();
  return `https://social-plugins.line.me/lineit/share?text=${encodeURIComponent(
    messageText
  )}`;
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};
