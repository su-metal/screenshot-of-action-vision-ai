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

const PLACEHOLDERS: Record<string, string> = {
  calendarTitle: '例：高校小学校 マラソン大会',
  calendarLocation: '場所名や住所',
  mapQuery: '例：高校小学校',
  searchQuery: '例：高校小学校 マラソン大会 2025',
  url: 'https://...',
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

    // Product / Task は基本「タイトル + 詳細 + search/url」寄り
    return ['calendarTitle', 'calendarDetails', 'searchQuery', 'url'] as (keyof Params)[];
  }, [editable.category, editable.params]);

  const renderField = (key: keyof Params) => {
    const value = (editable.params as any)[key];

    // null/undefined は出さない（要件：不要な入力フィールドはDOMから除去）
    if (value === null || value === undefined) return null;

    const label = LABELS[String(key)] ?? String(key);
    const placeholder = PLACEHOLDERS[String(key)] ?? '';

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
            placeholder={placeholder}
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
          placeholder={placeholder}
          onChange={(e) => setParam(key, e.target.value)}
        />
      </div>
    );
  };

  const renderActions = () => {
    const { category, params } = editable;
    const actions: React.ReactNode[] = [];

    if (category === ActionCategory.Event && (params.calendarTitle || params.calendarStart)) {
      actions.push(
        <Button
          key="cal"
          onClick={() => window.open(generateGoogleCalendarUrl(params), '_blank', 'noopener,noreferrer')}
          className="w-full sm:w-auto"
        >
          カレンダーに追加
        </Button>
      );
    }

    const mapSearchQuery =
      (params.mapQuery && String(params.mapQuery).trim()) ||
      (params.calendarLocation && String(params.calendarLocation).trim()) ||
      '';

    if (mapSearchQuery) {
      actions.push(
        <Button
          key="map"
          onClick={() => window.open(generateGoogleMapsUrl(mapSearchQuery), '_blank', 'noopener,noreferrer')}
          className="w-full sm:w-auto"
        >
          マップで確認
        </Button>
      );
    }


    if (params.searchQuery) {
      actions.push(
        <Button
          key="search"
          variant="outline"
          onClick={() => window.open(generateGoogleSearchUrl(params.searchQuery!), '_blank', 'noopener,noreferrer')}
          className="w-full sm:w-auto"
        >
          Webで検索
        </Button>
      );
    }

    actions.push(
      <Button
        key="line"
        onClick={() => {
          const url = generateLineShareUrl(editable);
          window.open(url, '_blank', 'noopener,noreferrer');
        }}
        className="w-full sm:w-auto bg-[#06C755] hover:bg-[#05b34c] text-white border-none shadow-sm"
      >
        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M24 10.304c0-4.579-5.383-8.304-12-8.304s-12 3.725-12 8.304c0 4.105 4.27 7.541 10.048 8.177.391.084.924.258 1.058.594.121.303.079.778.039 1.085l-.171 1.027c-.052.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.559-3.478 2.559-4.566z" />
        </svg>
        LINEで共有
      </Button>
    );

    if (params.url) {
      actions.push(
        <Button
          key="url"
          variant="ghost"
          onClick={() => window.open(params.url!, '_blank', 'noopener,noreferrer')}
          className="w-full sm:w-auto"
        >
          リンクを開く
        </Button>
      );
    }

    return actions.length > 0 ? <div className="flex flex-wrap gap-3 mt-6">{actions}</div> : null;
  };

  // “スクショ1のフォーム感”を出すため、title/detail は上部カードっぽく
  const topTitleLabel = editable.category === ActionCategory.Product ? '商品名' : 'イベント名';

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
        </div>

        {renderActions()}
      </div>
    </div>
  );
};
