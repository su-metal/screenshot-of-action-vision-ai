import React from 'react';
import { PredictionResult, ActionCategory } from '../types';
import { Button } from './Button';
import {
  generateGoogleCalendarUrl,
  generateGoogleSearchUrl,
  generateGoogleMapsUrl,
  generateLineShareUrl,
} from '../utils/helpers';

interface ResultCardProps {
  result: PredictionResult;
}

type Params = PredictionResult['params'];

const LABELS: Record<string, string> = {
  calendarTitle: 'タイトル',
  calendarStart: '開始日時',
  calendarEnd: '終了日時',
  calendarLocation: '場所',
  calendarDetails: '詳細',
  mapQuery: '地図検索（mapQuery）',
  searchQuery: '検索（searchQuery）',
  url: '関連URL',
  tel: 'TEL',
  productBrand: 'ブランド',
  productModel: '型番',
  productPrice: '価格',
  productCurrency: '通貨',
  productAvailability: '在庫',
  productShippingEta: '配送目安',
  productSeller: '販売元',
  productKeySpecs: '特徴',
};


const isISODateTime = (v: unknown) => {
  if (typeof v !== 'string') return false;
  // "2025-12-04T09:00:00" or "...:00Z" / "...+09:00" などを許容
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([zZ]|[+-]\d{2}:\d{2})?$/.test(v);
};

// input[type="datetime-local"] 用に整形（秒なし、TZなし）
const toDateTimeLocal = (v: string) => {
  // 2025-12-04T09:00:00 -> 2025-12-04T09:00
  // 2025-12-04T09:00:00Z -> 2025-12-04T09:00
  return v.replace(/([zZ]|[+-]\d{2}:\d{2})$/, '').slice(0, 16);
};

// 編集値を params に戻す（datetime-local -> ISOっぽい形に戻す：秒を付ける）
const fromDateTimeLocal = (v: string) => {
  if (!v) return '';
  // "2025-12-04T09:00" -> "2025-12-04T09:00:00"
  return v.length === 16 ? `${v}:00` : v;
};



// aiNotes から固定フォーマットのヒントを拾う
// 期待する形式（例）:
// date_no_year: 12/04
// time: 09:00
// end_date_no_year: 12/03
// end_time: 17:00
const pickHint = (text: string, key: string) => {
  const re = new RegExp(`^\\s*${key}\\s*:\\s*([^\\n\\r]+)\\s*$`, 'mi');
  const m = text.match(re);
  return m?.[1]?.trim() ?? '';
};

// aiNotes から内部キー(date_no_year等)だけを除去して、ユーザー向け本文だけ残す（編集OK）
const normalizeAiNotesForUser = (raw: string) => {
  const src = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!src) return '';

  const lines = src
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    // 内部キー行は全部削除
    .filter((l) => !/^\s*(date_no_year|time|end_date_no_year|end_time)\s*:/i.test(l))
    // もし過去に生成された「日付（年不明）」が混ざっていても削除
    .filter((l) => !/^\s*日付（年不明）\s*[:：]/.test(l));

  return lines.join('\n').trim();
};

// ===== ここから追加：説明(detail) と 詳細(calendarDetails) の役割整形 =====

// aiNotes（ユーザー向け整形済み）から「他の予定」「注記」を抽出して返す
const extractOtherScheduleFromAiNotes = (aiNotesRaw?: string) => {
  const text = normalizeAiNotesForUser(String(aiNotesRaw ?? ''));
  if (!text) return { hasOther: false, otherLines: [] as string[], noteLine: '' };

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 「他の予定:」ブロックを拾う
  const idxOther = lines.findIndex((l) => /^他の予定\s*[:：]/.test(l));
  const idxNote = lines.findIndex((l) => /^注記\s*[:：]/.test(l));

  let otherLines: string[] = [];
  if (idxOther >= 0) {
    const start = idxOther + 1;
    const end = idxNote >= 0 ? idxNote : lines.length;
    otherLines = lines.slice(start, end).filter(Boolean);
  }

  const noteLine = idxNote >= 0 ? lines[idxNote] : '';

  const hasOther = otherLines.length > 0 || !!noteLine;
  return { hasOther, otherLines, noteLine };
};

// ===== ここから置換：理想形（詳細=短い / 説明=要約1文 / 補足AI=一覧） =====

const parseMMDD = (s: string) => {
  const m = s.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  if (!mm || !dd) return null;
  return { mm, dd };
};

const formatJP_MD = (mm: number, dd: number) => `${mm}月${dd}日`;

const takeFirstSentenceOrLine = (s: string) => {
  const t = String(s ?? "").trim();
  if (!t) return "";
  const firstLine = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] ?? "";
  if (!firstLine) return "";
  const m = firstLine.match(/^(.+?。)/);
  return (m?.[1] ?? firstLine).trim();
};

// 予定一覧から「期間」と「含まれる予定カテゴリ」を要約する
const summarizeOtherPlans = (otherLines: string[], noteLine: string) => {
  if (!otherLines.length && !noteLine) return "";

  // 期間（最小MM/DD〜最大MM/DD）
  const dates = otherLines
    .map((l) => parseMMDD(l))
    .filter(Boolean) as { mm: number; dd: number }[];

  const toKey = (d: { mm: number; dd: number }) => d.mm * 100 + d.dd;
  let rangeText = "";
  if (dates.length) {
    const sorted = [...dates].sort((a, b) => toKey(a) - toKey(b));
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    // 同日だけなら「◯日まで」は不自然なので、範囲は出さない
    if (toKey(start) !== toKey(end)) {
      rangeText = `${formatJP_MD(start.mm, start.dd)}から${formatJP_MD(end.mm, end.dd)}まで`;
    }
  }

  // カテゴリ抽出（ざっくりでOK。あなたの例を優先）
  const textAll = otherLines.join("\n") + "\n" + String(noteLine ?? "");
  const cats: string[] = [];
  const pushIf = (label: string, re: RegExp) => {
    if (re.test(textAll) && !cats.includes(label)) cats.push(label);
  };

  pushIf("授業", /授業/);
  pushIf("下校時間", /下校/);
  pushIf("身体測定", /身体測定/);
  pushIf("避難訓練", /避難訓練/);
  pushIf("授業参観", /授業参観/);
  pushIf("学級懇談会", /学級懇談会|懇談会/);

  // 何も拾えなければ「複数の予定」
  const catsText = cats.length ? cats.join("、") : "複数の予定";

  // 最終文（あなたの理想形に合わせる）
  // 「その他、9日から26日まで…等の予定があります。」
  // rangeText が無ければ「その他、…の予定があります。」
  const head = rangeText ? `その他、${rangeText}` : "その他";
  return `${head}${catsText}等の予定があります。`;
};

// 詳細（calendarDetails）:
// 原則: モデルが返した calendarDetails をそのまま使う
// 例外: 「予定表モード」だけ短文化する（入学式など）
const buildCalendarDetailsIdeal = (r: PredictionResult) => {
  const p = (r.params ?? {}) as any;

  const startIso = String(p.calendarStart ?? "").trim();
  const cur = String(p.calendarDetails ?? "").trim();

  // 1) モデルが calendarDetails を返しているなら最優先で採用（空にしない）
  // ただし、予定表モードで「詳細を短くしたい」場合だけ例外処理へ
  if (cur) {
    const ai = String((r as any).aiNotes ?? "");
    const isScheduleMode = /他の予定|注記/i.test(ai); // 予定表モードの目印

    // 予定表モード以外は、そのまま返す（セミナー等はここで守られる）
    if (!isScheduleMode) return cur;

    // 予定表モード: 開始日時がフォームに入っているなら、重複を避けて短文化
    // 例: 「入学式。」など “短い名詞句+。” に寄せる
    // titleを使う（入学式固定はやめる）
    if (startIso) return `${String(r.title ?? "").trim() || "予定"}。`;

    // startIso が無い場合だけ、aiNotes の date_no_year が取れれば日付つき
    const dny = pickHint(ai, "date_no_year"); // 04/08
    const parsed = dny ? parseMMDD(dny) : null;
    if (parsed) {
      const t = String(r.title ?? "").trim() || "予定";
      return `${formatJP_MD(parsed.mm, parsed.dd)}に${t}。`;
    }

    // それも無理なら、元の calendarDetails を返す
    return cur;
  }

  // 2) calendarDetails が空の場合の保険（ここでは “空” にしない）
  // startIso があるなら、title を短く入れておく（重複は気にしない）
  if (startIso) {
    const t = String(r.title ?? "").trim();
    return t ? `${t}。` : "";
  }

  // startIso が無い場合は date_no_year が取れれば日付つき
  const ai = String((r as any).aiNotes ?? "");
  const dny = pickHint(ai, "date_no_year");
  const parsed = dny ? parseMMDD(dny) : null;
  if (parsed) {
    const t = String(r.title ?? "").trim() || "予定";
    return `${formatJP_MD(parsed.mm, parsed.dd)}に${t}。`;
  }

  return "";
};



// 説明（detail）= 主イベント1文 + その他予定の要約1文（一覧は入れない）
const buildDetailIdeal = (baseDetail: string, aiNotesRaw?: string) => {
  const base = takeFirstSentenceOrLine(baseDetail); // 例: "4月8日(月)に入学式があります。"
  const { hasOther, otherLines, noteLine } = extractOtherScheduleFromAiNotes(aiNotesRaw);
  if (!hasOther) return base;

  const summary = summarizeOtherPlans(otherLines, noteLine);
  if (!summary) return base;

  // 既に「その他…予定があります」が含まれてるなら足さない
  if (/その他.*予定があります/.test(base)) return base;

  return base ? `${base} ${summary}` : summary;
};

// 最終整形：理想形に合わせて detail / calendarDetails を確定させる
const normalizeDetailAndCalendarDetails = (r: PredictionResult): PredictionResult => {
  const p = (r.params ?? {}) as any;
  const aiNotesRaw = (r as any).aiNotes as string | undefined;

  const nextDetail = buildDetailIdeal(String(r.detail ?? ""), aiNotesRaw);
  const nextCalendarDetails = buildCalendarDetailsIdeal(r);

  return {
    ...r,
    detail: nextDetail,
    params: {
      ...p,
      calendarDetails: nextCalendarDetails, // ← 詳細は主イベントだけ
    },
  };
};

// ===== ここまで追加 =====


const pad2 = (n: number) => String(n).padStart(2, '0');

const toISOFromNoYearHint = (year: number, mmdd: string, hhmm?: string) => {
  // mmdd: "12/04" or "12-04"
  const m = mmdd.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return '';
  const month = pad2(Number(m[1]));
  const day = pad2(Number(m[2]));
  const time = (hhmm && /^\d{2}:\d{2}$/.test(hhmm)) ? hhmm : '09:00';
  // 秒つき（ResultCard内の datetime-local 変換が扱いやすい）
  return `${year}-${month}-${day}T${time}:00`;
};

// テキストから「10:00～16:00」系の時間範囲を拾う
const pickTimeRange = (text: string) => {
  // 10:00～16:00 / 10:00-16:00 / 10:00〜16:00 / 10:00ー16:00
  const m = text.match(/(\d{1,2}:\d{2})\s*[～〜\-ー]\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  const start = m[1].padStart(5, '0');
  const end = m[2].padStart(5, '0');
  return { start, end };
};

// テキストから「明示の年月日」を拾う（推測ではなく根拠のある年だけ）
// 例: 2017年10月22日 / 2017/10/22 / 2017-10-22 / 2017.10.22
const pickExplicitYMD = (text: string) => {
  const m = text.match(/((?:19|20)\d{2})\s*(?:年|[\/\-\.])\s*(\d{1,2})\s*(?:月|[\/\-\.])\s*(\d{1,2})\s*(?:日)?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = String(Number(m[2])).padStart(2, '0');
  const dd = String(Number(m[3])).padStart(2, '0');
  return { y, mm, dd, ymd: `${y}-${mm}-${dd}` };
};

// テキストから「明示の年（YYYY）」だけを拾う（2023 など）
// 注意：電話番号等を拾わないよう、単独の4桁を優先
const pickExplicitYearOnly = (text: string) => {
  if (!text) return null;

  // まず「2023年」形式を優先
  let m = text.match(/(?:^|[^\d])((?:19|20)\d{2})\s*年(?:[^\d]|$)/);
  if (m) return Number(m[1]);

  // 次に単独の "2023" を拾う（前後が数字でない4桁）
  m = text.match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/);
  if (m) return Number(m[1]);

  return null;
};


// ISOの「日付部分だけ」を差し替える（時間は維持）
// iso が空なら date + fallbackTime で組み立てる
const replaceIsoDatePart = (iso: string, ymd: string, fallbackTime?: string) => {
  if (iso && /^\d{4}-\d{2}-\d{2}T/.test(iso)) {
    return iso.replace(/^\d{4}-\d{2}-\d{2}/, ymd);
  }
  const t = (fallbackTime && /^\d{2}:\d{2}$/.test(fallbackTime)) ? fallbackTime : '09:00';
  return `${ymd}T${t}:00`;
};

// calendarEnd が空の時だけ、start の日付 + 範囲の end 時刻で補完する
const ensureEndFromRange = (startIso: string, endIso: string, sourceText: string) => {
  if (!startIso || endIso) return endIso;

  const tr = pickTimeRange(sourceText);
  if (!tr) return endIso;

  const m = startIso.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (!m) return endIso;

  return `${m[1]}T${tr.end}:00`;
};


const shiftISOYear = (iso: string, deltaYears: number) => {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})(:\d{2})?$/);
  if (!m) return iso;
  const y = Number(m[1]) + deltaYears;
  const mm = m[2];
  const dd = m[3];
  const hhmm = m[4];
  const ss = m[5] ?? ':00';
  return `${y}-${mm}-${dd}T${hhmm}${ss}`;
};


// result を editable に入れる前に「今年で補完」する（自動で翌年には繰上げない）
// ただし date_no_year がある場合は、AIが推測で入れた年を上書きして「今年」に寄せる
const hasExplicitYear = (text: string) => {
  if (!text) return false;
  // 2017年 / 2017/10/22 / 2017-10-22 などを拾う
  return /(?:\b\d{4}\b\s*年)|(?:\b\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b)/.test(text);
};

// result を editable に入れる前に補正する
// 優先順位:
// 1) テキスト中に明示の年月日（例: 2017年10月22日）があれば、それを最優先（推測禁止）
// 2) 明示年が無く、aiNotes に date_no_year があれば「今年」で補完（従来仕様）
// 3) calendarEnd が空なら、時間範囲（10:00～16:00 等）から end を補完
const applyYearFallbackFromAiNotes = (r: PredictionResult): PredictionResult => {
  const aiNotes = (r as any).aiNotes as string | undefined;
  const p = r.params ?? ({} as any);

  // 終了補完や “明示年” 検出用のソース
  const joined = [
    r.title ?? '',
    (r as any).detail ?? '',
    String(p.calendarDetails ?? ''),
    String(aiNotes ?? ''),
  ].filter((s) => typeof s === 'string' && s.trim()).join('\n');

  const explicitYearOnly = pickExplicitYearOnly(joined);


  // 1) 明示の年月日があれば、それを最優先
  const explicit = pickExplicitYMD(joined);

  let nextStart = String(p.calendarStart ?? '');
  let nextEnd = String(p.calendarEnd ?? '');

  if (explicit) {
    const tr = pickTimeRange(joined);
    const timeHint = aiNotes ? pickHint(aiNotes, 'time') : '';
    const endTimeHint = aiNotes ? pickHint(aiNotes, 'end_time') : '';

    // start: 既存の時刻を保持。無ければ範囲start→aiNotes time→09:00
    nextStart = replaceIsoDatePart(nextStart, explicit.ymd, tr?.start || timeHint || '09:00');

    // end: 既にあれば日付だけ揃える。無ければ範囲end→aiNotes end_time
    if (nextEnd) {
      nextEnd = replaceIsoDatePart(nextEnd, explicit.ymd, tr?.end || endTimeHint);
    } else {
      const endTime = tr?.end || endTimeHint;
      if (endTime && /^\d{2}:\d{2}$/.test(endTime)) {
        nextEnd = `${explicit.ymd}T${endTime}:00`;
      }
    }

    // 明示年ケースでも、calendarEnd がまだ空なら「時間範囲」から最後に補完
    const fixedEnd = ensureEndFromRange(nextStart, nextEnd, joined);

    return {
      ...r,
      params: {
        ...p,
        calendarStart: nextStart || p.calendarStart || '',
        calendarEnd: fixedEnd || nextEnd || p.calendarEnd || '',
      },
    };
  }


  // 2) 明示年が無い場合のみ、従来の date_no_year → 今年補完
  if (aiNotes && typeof aiNotes === 'string') {
    const dateNoYear = pickHint(aiNotes, 'date_no_year');

    if (dateNoYear) {
      const time = pickHint(aiNotes, 'time');
      const endDateNoYear = pickHint(aiNotes, 'end_date_no_year');
      const endTime = pickHint(aiNotes, 'end_time');

      const year = explicitYearOnly ?? new Date().getFullYear();

      const calendarStart = toISOFromNoYearHint(year, dateNoYear, time);
      const calendarEnd = endDateNoYear
        ? toISOFromNoYearHint(year, endDateNoYear, endTime)
        : (p.calendarEnd ?? '');

      const fixedEnd = ensureEndFromRange(
        String(calendarStart || p.calendarStart || ''),
        String(calendarEnd || p.calendarEnd || ''),
        joined
      );

      return {
        ...r,
        params: {
          ...p,
          calendarStart: calendarStart || p.calendarStart || '',
          calendarEnd: fixedEnd || calendarEnd || p.calendarEnd || '',
        },
      };
    }
  }

  // 3) date_no_year も無いけど、calendarEnd が空なら時間範囲から補完だけは試す
  const fixedEnd = ensureEndFromRange(nextStart, nextEnd, joined);

  return {
    ...r,
    params: {
      ...p,
      calendarStart: nextStart || p.calendarStart || '',
      calendarEnd: fixedEnd || nextEnd || p.calendarEnd || '',
    },
  };
};




export const ResultCard: React.FC<ResultCardProps> = ({ result }) => {
  const [calendarDetailsExpanded, setCalendarDetailsExpanded] = React.useState(false);
  const [editable, setEditable] = React.useState<PredictionResult>(result);

  // result が切り替わった時に編集状態も同期（年なし日付は今年で補完）
  // さらに「説明(detail)=深く」「詳細(calendarDetails)=短く」をUI側で確定させる
  React.useEffect(() => {
    // DEBUG: 感じの良いログ確認用（後で消す）
    console.log("[DEBUG] ResultCard incoming aiNotes", (result as any).aiNotes);
    console.log("[DEBUG] raw calendarDetails",
      (result.params as any)?.calendarDetails
    );
    const fixed = applyYearFallbackFromAiNotes(result);
    console.log("[DEBUG] after year fallback calendarDetails",
      (fixed.params as any)?.calendarDetails
    );
    const normalized = normalizeDetailAndCalendarDetails(fixed);
    console.log("[DEBUG] ResultCard normalized aiNotes", (normalized as any).aiNotes);
    console.log("[DEBUG] normalized calendarDetails",
      (normalized.params as any)?.calendarDetails
    );
    setEditable(normalized);
    setCalendarDetailsExpanded(false);

  }, [result]);

  const getCategoryColor = (cat: ActionCategory) => {
    switch (cat) {
      case ActionCategory.Event:
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case ActionCategory.Product:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case ActionCategory.Task:
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case ActionCategory.Place:
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const setParam = (key: keyof Params, value: any) => {
    setEditable((prev) => ({
      ...prev,
      params: {
        ...prev.params,
        [key]: value,
      },
    }));
  };

  const getISOYear = (iso: string) => {
    const m = iso.match(/^(\d{4})-/);
    return m ? Number(m[1]) : null;
  };

  const replaceISOYear = (iso: string, newYear: number) => {
    if (!iso) return iso;
    const y = String(newYear).padStart(4, '0');
    if (/^\d{4}-\d{2}-\d{2}T/.test(iso)) return iso.replace(/^\d{4}-/, `${y}-`);
    return iso;
  };

  const applyCalendarYear = (newYear: number) => {
    setEditable((prev) => {
      const p: any = prev.params ?? {};
      const startIso = String(p.calendarStart ?? '');
      const endIso = String(p.calendarEnd ?? '');

      // start があれば年だけ差し替え
      let nextStart = startIso ? replaceISOYear(startIso, newYear) : '';

      // start が空でも aiNotes に date_no_year があるなら、選年で start を作る
      if (!nextStart) {
        const ai = String((prev as any).aiNotes ?? '');
        const dateNoYear = pickHint(ai, 'date_no_year'); // 例: 04/08
        if (dateNoYear) {
          const time = pickHint(ai, 'time'); // 例: 09:00
          nextStart = toISOFromNoYearHint(newYear, dateNoYear, time);
        }
      }

      // end は存在する場合のみ追従（年だけ差し替え）
      let nextEnd = endIso;
      if (nextStart && endIso) {
        nextEnd = replaceISOYear(endIso, newYear);
      }

      return {
        ...prev,
        params: {
          ...p,
          calendarStart: nextStart || p.calendarStart || '',
          calendarEnd: nextEnd,
        },
      };
    });
  };

  // 「フォームとして出す」順番（スクショ1の並びに寄せる）
  const FIELD_ORDER: (keyof Params)[] = [
    'calendarTitle',
    'calendarStart',
    'calendarEnd',
    'calendarLocation',
    'tel',
    'calendarDetails',
    'mapQuery',
    'productBrand',
    'productModel',
    'productPrice',
    'productCurrency',
    'productAvailability',
    'productShippingEta',
    'productSeller',
    'productKeySpecs',
    'searchQuery',
    'url',
  ];

  const nowYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 9 }, (_, i) => nowYear - 2 + i); // 今年±2年（合計9）


  // カテゴリごとに「見せるフィールド」を絞る（DOMから除去）
  const visibleKeys = React.useMemo(() => {
    const p = editable.params as any;

    const hasEventCore =
      p.calendarTitle || p.calendarStart || p.calendarEnd || p.calendarLocation || p.calendarDetails;

    if (editable.category === ActionCategory.Event) {
      return ['calendarTitle', 'calendarStart', 'calendarEnd', 'calendarLocation', 'tel', 'calendarDetails', 'mapQuery', 'url'] as (keyof Params)[];
    }

    if (editable.category === ActionCategory.Place) {
      return ['calendarTitle', 'calendarLocation', 'mapQuery', 'searchQuery', 'url'] as (keyof Params)[];
    }

    // Product は商品情報を構造化して表示（検索/URLも含む）
    if (editable.category === ActionCategory.Product) {
      return [
        'productBrand',
        'productModel',
        'productPrice',
        'productCurrency',
        'productAvailability',
        'productShippingEta',
        'productSeller',
        'productKeySpecs',
        'searchQuery',
        'url',
      ] as (keyof Params)[];
    }

    // Task は従来通り（必要なら開始日時もここに後で足せる）
    return ['calendarTitle', 'calendarDetails', 'searchQuery', 'url'] as (keyof Params)[];

  }, [editable.category, editable.params]);

  // 年なし日付（date_no_year）があり、開始日時が「今日より前」なら “来年に切替” を提案（自動では切替しない）
  // const yearSuggestion = React.useMemo(() => {
  //   const aiNotes = (editable as any).aiNotes as string | undefined;
  //   if (!aiNotes) return null;

  //   const dateNoYear = pickHint(aiNotes, 'date_no_year');
  //   if (!dateNoYear) return null;

  //   const start = (editable.params as any)?.calendarStart as string | undefined;
  //   if (!start) return null;

  //   const startDate = new Date(start);
  //   if (Number.isNaN(startDate.getTime())) return null;

  //   const now = new Date();
  //   const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  //   // 今日より前なら「来年へ」
  //   if (startDate.getTime() >= today0.getTime()) return null;

  //   const next = shiftISOYear(start, 1);
  //   return {
  //     nextISO: next,
  //     label: `来年に切替（${next.slice(0, 10).replaceAll('-', '/')}）`,
  //   };
  // }, [editable]);


  const renderField = (key: keyof Params) => {
    const value = (editable.params as any)[key];

    // null/undefined は出さない（要件：不要な入力フィールドはDOMから除去）
    if (value === null || value === undefined) return null;
    // 追加：空文字も出さない（PRODUCTの空欄量産対策）
    if (typeof value === 'string' && value.trim() === '') return null;

    const label = LABELS[String(key)] ?? String(key);

    const commonInput =
      'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none ' +
      'focus:bg-white focus:border-gray-300 focus:ring-4 focus:ring-black/5 transition';

    const commonLabel = 'text-sm font-semibold text-gray-700 mb-2';

    // datetime系
    if ((key === 'calendarStart' || key === 'calendarEnd') && typeof value === 'string') {
      const dt = isISODateTime(value) ? toDateTimeLocal(value) : value;

      return (
        <div key={String(key)} className="flex flex-col">
          <div className={commonLabel}>{label}</div>

          <input
            type="datetime-local"
            className={commonInput}
            value={dt || ''}
            onChange={(e) => {
              const nextIso = fromDateTimeLocal(e.target.value);

              // calendarEnd は従来通り
              if (key !== 'calendarStart') {
                setParam(key, nextIso);
                return;
              }

              // calendarStart の年が変わったら、calendarEnd も同じ差分だけ追随させる
              setEditable((prev) => {
                const prevStart = String((prev.params as any).calendarStart ?? '');
                const prevYear = getISOYear(prevStart);
                const nextYear = getISOYear(nextIso);

                let nextEnd = (prev.params as any).calendarEnd;

                if (
                  prevYear &&
                  nextYear &&
                  prevYear !== nextYear &&
                  typeof nextEnd === 'string' &&
                  nextEnd
                ) {
                  const delta = nextYear - prevYear;
                  nextEnd = shiftISOYear(nextEnd, delta);
                }

                return {
                  ...prev,
                  params: {
                    ...prev.params,
                    calendarStart: nextIso,
                    calendarEnd: nextEnd,
                  },
                };
              });
            }}
          />
          {key === 'calendarStart' && (
            <div className="mt-2 flex items-center gap-2">
              <div className="text-xs font-semibold text-gray-600">年</div>
              <select
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-gray-300 focus:ring-4 focus:ring-black/5"
                value={getISOYear(String((editable.params as any)?.calendarStart ?? '')) ?? ''}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  if (!y) return;
                  applyCalendarYear(y);
                }}
              >
                <option value="">選択</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <input
                className="h-9 w-24 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-gray-300 focus:ring-4 focus:ring-black/5"
                inputMode="numeric"
                placeholder="YYYY"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const v = (e.currentTarget as HTMLInputElement).value.trim();
                  const y = Number(v);
                  if (y >= 1900 && y <= 2100) applyCalendarYear(y);
                }}
              />
              <div className="text-xs text-gray-500">Enterで適用</div>
            </div>
          )}
          {/* {key === 'calendarStart' && yearSuggestion?.nextISO && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  setEditable((prev) => {
                    const prevStart = String((prev.params as any).calendarStart ?? '');
                    const prevYear = getISOYear(prevStart);
                    const nextYear = getISOYear(yearSuggestion.nextISO);

                    let nextEnd = (prev.params as any).calendarEnd;

                    if (
                      prevYear &&
                      nextYear &&
                      prevYear !== nextYear &&
                      typeof nextEnd === 'string' &&
                      nextEnd
                    ) {
                      const delta = nextYear - prevYear;
                      nextEnd = shiftISOYear(nextEnd, delta);
                    }

                    return {
                      ...prev,
                      params: {
                        ...prev.params,
                        calendarStart: yearSuggestion.nextISO,
                        calendarEnd: nextEnd,
                      },
                    };
                  });
                }}

                className="text-sm font-semibold text-gray-700 underline underline-offset-4 hover:text-gray-900"
              >
                {yearSuggestion.label}
              </button>
            </div>
          )} */}
        </div>
      );
    }

    // 詳細は textarea
    if (key === 'calendarDetails') {
      return (
        <div key={String(key)} className="flex flex-col sm:col-span-2">
          <div className={commonLabel}>{label}</div>
          <textarea
            className={commonInput + ' min-h-[110px] resize-y'}
            value={String(value ?? '')}
            onChange={(e) => setParam(key, e.target.value)}
          />
        </div>
      );
    }


    // それ以外は text
    if (key === 'productKeySpecs') {
      return (
        <div key={String(key)} className="flex flex-col sm:col-span-2">
          <div className={commonLabel}>{label}</div>
          <textarea
            className={commonInput + ' min-h-[110px] resize-y'}
            value={String(value ?? '')}
            onChange={(e) => setParam(key, e.target.value)}
          />
        </div>
      );
    }

    return (
      <div key={String(key)} className="flex flex-col">
        <div className={commonLabel}>{label}</div>
        <input
          type="text"
          className={commonInput}
          value={String(value ?? '')}
          onChange={(e) => setParam(key, e.target.value)}
        />
      </div>
    );
  };

  const renderActions = () => {
    const { category, params } = editable;
    const actions: React.ReactNode[] = [];

    // Google Calendar
    if ((category === ActionCategory.Event || category === ActionCategory.Task) && (params.calendarTitle || params.calendarStart)) {
      actions.push(
        <Button variant="gcal"
          key="cal"
          onClick={() => window.open(generateGoogleCalendarUrl(params), '_blank', 'noopener,noreferrer')}
          className="w-full sm:w-auto bg-[#4285F4] hover:bg-[#2b6de0] text-white border-none shadow-sm"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1.5A2.5 2.5 0 0 1 22 6.5v13A2.5 2.5 0 0 1 19.5 22h-15A2.5 2.5 0 0 1 2 19.5v-13A2.5 2.5 0 0 1 4.5 4H6V3a1 1 0 0 1 1-1Zm12.5 8h-15v9.5c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5V10Zm-14-4a.5.5 0 0 0-.5.5V8h15V6.5a.5.5 0 0 0-.5-.5h-1.5v1a1 1 0 1 1-2 0V6H8v1a1 1 0 1 1-2 0V6H4.5Z" />
          </svg>
          カレンダーに追加
        </Button>
      );
    }

    // Google Maps（カテゴリ問わず、場所があれば表示にしたい場合は mapSearchQuery を使う実装にしている前提）
    const mapSearchQuery =
      (params.mapQuery && String(params.mapQuery).trim()) ||
      (params.calendarLocation && String(params.calendarLocation).trim()) ||
      '';

    if (mapSearchQuery) {
      actions.push(
        <Button variant="gmap"
          key="map"
          onClick={() => window.open(generateGoogleMapsUrl(mapSearchQuery), '_blank', 'noopener,noreferrer')}
          className="w-full sm:w-auto bg-[#34A853] hover:bg-[#2d8f46] text-white border-none shadow-sm"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2c3.866 0 7 3.134 7 7 0 4.2-4.4 10.2-6.2 12.5a1 1 0 0 1-1.6 0C9.4 19.2 5 13.2 5 9c0-3.866 3.134-7 7-7Zm0 9.5A2.5 2.5 0 1 0 12 6.5a2.5 2.5 0 0 0 0 5Z" />
          </svg>
          マップで確認
        </Button>
      );
    }

    // Web Search（Googleっぽい “白＋青枠”）
    if (params.searchQuery) {
      actions.push(
        <Button variant="search"
          key="search"
          onClick={() => window.open(generateGoogleSearchUrl(params.searchQuery!), '_blank', 'noopener,noreferrer')}
          className="w-full sm:w-auto bg-white hover:bg-gray-50 text-[#4285F4] border border-[#4285F4] shadow-sm"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M10.5 3a7.5 7.5 0 1 1 4.7 13.35l3.72 3.72a1 1 0 0 1-1.42 1.42l-3.72-3.72A7.5 7.5 0 0 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" />
          </svg>
          Webで検索
        </Button>
      );
    }

    // LINE（現状のままでOK：緑＋吹き出しSVG）
    actions.push(
      <Button
        key="line"
        variant="line"
        onClick={() => {
          const url = generateLineShareUrl(editable);
          window.open(url, "_blank", "noopener,noreferrer");
        }}
        className="w-full sm:w-auto"
      >
        LINEで共有
      </Button>

    );

    // Open URL（控えめ＋外部リンク）
    if (params.url) {
      actions.push(
        <Button variant="link"
          key="url"
          onClick={() => window.open(params.url, '_blank', 'noopener,noreferrer')}
          className="w-full sm:w-auto bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 shadow-sm"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M14 3a1 1 0 1 0 0 2h3.586L10.293 12.293a1 1 0 1 0 1.414 1.414L19 6.414V10a1 1 0 1 0 2 0V3h-7Z" />
            <path d="M5 5a2 2 0 0 1 2-2h4a1 1 0 1 1 0 2H7v12h12v-4a1 1 0 1 1 2 0v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5Z" />
          </svg>
          リンクを開く
        </Button>
      );
    }
    return actions.length > 0 ? <div className="flex flex-wrap gap-3 mt-6">{actions}</div> : null;
  };

  // “スクショ1のフォーム感”を出すため、title/detail は上部カードっぽく
  const topTitleLabel = editable.category === ActionCategory.Product ? '商品名' : 'イベント名';
  const aiNotes = (editable as any).aiNotes as string | undefined;

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${getCategoryColor(editable.category)}`}>
            {editable.category}
          </span>
        </div>

        {/* タイトル（フォーム） */}
        <div className="mb-6">
          <div className="text-sm font-semibold text-gray-700 mb-2">{topTitleLabel}</div>
          <input
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base font-semibold text-gray-900 outline-none focus:bg-white focus:border-gray-300 focus:ring-4 focus:ring-black/5 transition"
            value={editable.title}
            onChange={(e) => setEditable((prev) => ({ ...prev, title: e.target.value }))}
          />
        </div>

        {/* 主要フォーム（params） */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FIELD_ORDER.filter((k) => visibleKeys.includes(k))
                .map((k) => renderField(k))}
            </div>
          </div>

          {(
            editable.category !== ActionCategory.Product || // Productは常に表示
            (typeof aiNotes === 'string' && aiNotes.trim() !== '')
          ) && (
              <div className="px-4 sm:px-5 pb-5">
                <div className="text-sm font-semibold text-gray-700 mb-2">
                  説明・補足
                </div>
                <textarea
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:bg-white focus:border-gray-300 focus:ring-4 focus:ring-black/5 transition min-h-[120px] resize-y"
                  value={normalizeAiNotesForUser(aiNotes ?? '')}
                  onChange={(e) =>
                    setEditable((prev) => ({ ...(prev as any), aiNotes: e.target.value }))
                  }
                />
              </div>
            )}
        </div>

        {renderActions()}
      </div>
    </div>
  );
};
