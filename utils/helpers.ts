
import { ActionParams, PredictionResult } from "../types";

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
  const { title, detail, params } = result;
  const { calendarStart, calendarEnd, calendarLocation, calendarDetails, url, calendarTitle } = params;

  const dateRange = formatDateTimeRange(calendarStart, calendarEnd);
  
  let messageText = `【ActionShotで見つけた情報】\n`;
  messageText += `タイトル: ${calendarTitle || title}\n`;
  if (dateRange) messageText += `日時: ${dateRange}\n`;
  if (calendarLocation) messageText += `場所: ${calendarLocation}\n`;
  messageText += `詳細: ${calendarDetails || detail}\n`;
  if (url) messageText += `URL: ${url}`;

  // Apply character limit of 800 to prevent HTTP 400 errors
  const LIMIT = 800;
  if (messageText.length > LIMIT) {
    messageText = messageText.substring(0, LIMIT - 3) + "...";
  }
  
  const finalUrl = `https://social-plugins.line.me/lineit/share?text=${encodeURIComponent(messageText.trim())}`;
  
  // Logging for development/debugging
  console.log("Generated LINE URL:", finalUrl);
  
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
