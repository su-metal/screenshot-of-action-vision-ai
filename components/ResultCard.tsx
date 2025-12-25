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

export const ResultCard: React.FC<ResultCardProps> = ({ result }) => {
  const [editable, setEditable] = React.useState<PredictionResult>(result);

  // result が切り替わった時に編集状態も同期
  React.useEffect(() => {
    setEditable(result);
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

  // 「フォームとして出す」順番（スクショ1の並びに寄せる）
  const FIELD_ORDER: (keyof Params)[] = [
    'calendarTitle',
    'calendarStart',
    'calendarEnd',
    'calendarLocation',
    'calendarDetails',
    'mapQuery',
    'searchQuery',
    'url',
  ];

  // カテゴリごとに「見せるフィールド」を絞る（DOMから除去）
  const visibleKeys = React.useMemo(() => {
    const p = editable.params as any;

    const hasEventCore =
      p.calendarTitle || p.calendarStart || p.calendarEnd || p.calendarLocation || p.calendarDetails;

    if (editable.category === ActionCategory.Event || hasEventCore) {
      return ['calendarTitle', 'calendarStart', 'calendarEnd', 'calendarLocation', 'calendarDetails', 'mapQuery', 'searchQuery', 'url'] as (keyof Params)[];
    }

    if (editable.category === ActionCategory.Place) {
      return ['calendarTitle', 'calendarLocation', 'mapQuery', 'searchQuery', 'url'] as (keyof Params)[];
    }

    // Product は「検索 + URL」だけ（商品名/説明/補足で十分）
    if (editable.category === ActionCategory.Product) {
      return ['searchQuery', 'url'] as (keyof Params)[];
    }

    // Task は従来通り（必要なら開始日時もここに後で足せる）
    return ['calendarTitle', 'calendarDetails', 'searchQuery', 'url'] as (keyof Params)[];

  }, [editable.category, editable.params]);

  const renderField = (key: keyof Params) => {
    const value = (editable.params as any)[key];

    // null/undefined は出さない（要件：不要な入力フィールドはDOMから除去）
    if (value === null || value === undefined) return null;

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
            onChange={(e) => setParam(key, fromDateTimeLocal(e.target.value))}
          />
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
        <Button
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
        <Button
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
        <Button
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
        <Button
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
  const showAiNotes = editable.category === ActionCategory.Product;


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

          {/* detail（説明文） */}
          <div className="px-4 sm:px-5 pb-5">
            <div className="text-sm font-semibold text-gray-700 mb-2">説明</div>
            <textarea
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:bg-white focus:border-gray-300 focus:ring-4 focus:ring-black/5 transition min-h-[110px] resize-y"
              value={editable.detail}
              onChange={(e) => setEditable((prev) => ({ ...prev, detail: e.target.value }))}
            />
          </div>
          {showAiNotes && (
            <div className="px-4 sm:px-5 pb-5">
              <div className="text-sm font-semibold text-gray-700 mb-2">補足（AI）</div>
              <textarea
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:bg-white focus:border-gray-300 focus:ring-4 focus:ring-black/5 transition min-h-[90px] resize-y"
                value={aiNotes ?? ''}
                onChange={(e) => setEditable((prev) => ({ ...(prev as any), aiNotes: e.target.value }))}
              />
            </div>
          )}
        </div>

        {renderActions()}
      </div>
    </div>
  );
};
