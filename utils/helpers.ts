
import { ActionParams, PredictionResult, ActionCategory } from "../types";


const formatDateTime = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const m = d.getMonth() + 1;
  const date = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return { m, date, h, min, full: `${m}月${date}日 ${h}:${min}`, day: `${m}月${date}日` };
};

const formatDateTimeRange = (startIso?: string, endIso?: string): string => {
  const start = formatDateTime(startIso);
  const end = formatDateTime(endIso);
  
  if (!start && !end) return "";
  if (start && !end) return typeof start === 'string' ? start : start.full;
  if (!start && end) return typeof end === 'string' ? end : end.full;
  
  // If either is a string (failed to parse), just join them
  if (typeof start === 'string' || typeof end === 'string') return `${start} 〜 ${end}`;
  if (!start || !end) return ""; // Typescript safety

  // Both are successful Date objects
  if (start.day === end.day) {
    return `${start.full} 〜 ${end.h}:${end.min}`;
  }
  return `${start.full} 〜 ${end.full}`;
};

export const generateGoogleCalendarUrl = (params: ActionParams): string => {
  const { calendarTitle, calendarStart, calendarEnd, calendarLocation, calendarDetails } = params;
  const baseUrl = "https://www.google.com/calendar/render?action=TEMPLATE";
  
  let url = `${baseUrl}&text=${encodeURIComponent(calendarTitle || "Scheduled Action")}`;
  
  if (calendarStart && calendarEnd) {
    const start = calendarStart.replace(/-|:|\.\d\d\d/g, "");
    const end = calendarEnd.replace(/-|:|\.\d\d\d/g, "");
    url += `&dates=${start}/${end}`;
  } else if (calendarStart) {
    const start = calendarStart.replace(/-|:|\.\d\d\d/g, "");
    url += `&dates=${start}/${start}`;
  }
  
  if (calendarLocation) url += `&location=${encodeURIComponent(calendarLocation)}`;
  if (calendarDetails) url += `&details=${encodeURIComponent(calendarDetails)}`;
  
  return url;
};

export const generateGoogleSearchUrl = (query: string): string => {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

export const generateGoogleMapsUrl = (query: string): string => {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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
  } = params as any;

  const dateRange = formatDateTimeRange(calendarStart, calendarEnd);

  const normalizedTitle = (calendarTitle || title || "").trim();
  const normalizedDetail = (calendarDetails || detail || "").trim();
  const normalizedPlace = (calendarLocation || "").trim();
  const normalizedUrl = (url || "").trim();

  // EVENT/PLACE のときだけ、末尾に地図URLを付与する
  const isEventOrPlace =
    category === ActionCategory.Event || category === ActionCategory.Place;

  const mapSearchQuery = (String(mapQuery || "").trim() || normalizedPlace).trim();
  const mapUrl = isEventOrPlace && mapSearchQuery ? generateGoogleMapsUrl(mapSearchQuery) : "";

  // 黄金フォーマット（絵文字）
  const lines: string[] = [];
  if (normalizedTitle) lines.push(`📌 ${normalizedTitle}`);
  if (dateRange) lines.push(`🗓️ ${dateRange}`);
  if (normalizedPlace) lines.push(`📍 ${normalizedPlace}`);
  if (normalizedDetail) lines.push(`📝 ${normalizedDetail}`);
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
    // 本文だけ切る（…を付ける）
    const ellipsis = "...";
    const cut = Math.max(0, availableForBody - ellipsis.length);
    body = body.substring(0, cut) + ellipsis;
  }

  const messageText = (body + tail).trim();
  const finalUrl = `https://social-plugins.line.me/lineit/share?text=${encodeURIComponent(messageText)}`;
  return finalUrl;
};


export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};
