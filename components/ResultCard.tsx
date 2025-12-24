
import React from 'react';
import { PredictionResult, ActionCategory } from '../types';
import { Button } from './Button';
import { generateGoogleCalendarUrl, generateGoogleSearchUrl, generateGoogleMapsUrl, generateLineShareUrl } from '../utils/helpers';

interface ResultCardProps {
  result: PredictionResult;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result }) => {
  const getCategoryColor = (cat: ActionCategory) => {
    switch (cat) {
      case ActionCategory.Event: return 'bg-blue-100 text-blue-800 border-blue-200';
      case ActionCategory.Product: return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case ActionCategory.Task: return 'bg-amber-100 text-amber-800 border-amber-200';
      case ActionCategory.Place: return 'bg-rose-100 text-rose-800 border-rose-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const renderActions = () => {
    const { category, params } = result;
    const actions = [];

    if (category === ActionCategory.Event && (params.calendarTitle || params.calendarStart)) {
      actions.push(
        <Button key="cal" onClick={() => window.open(generateGoogleCalendarUrl(params), '_blank', 'noopener,noreferrer')} className="w-full sm:w-auto">
          カレンダーに追加
        </Button>
      );
    }

    if (category === ActionCategory.Place && params.mapQuery) {
      actions.push(
        <Button key="map" onClick={() => window.open(generateGoogleMapsUrl(params.mapQuery!), '_blank', 'noopener,noreferrer')} className="w-full sm:w-auto">
          マップで見る
        </Button>
      );
    }

    if (params.searchQuery) {
      actions.push(
        <Button key="search" variant="outline" onClick={() => window.open(generateGoogleSearchUrl(params.searchQuery!), '_blank', 'noopener,noreferrer')} className="w-full sm:w-auto">
          Webで検索
        </Button>
      );
    }

    // LINE Share Button
    actions.push(
      <Button 
        key="line" 
        onClick={() => {
          const url = generateLineShareUrl(result);
          window.open(url, '_blank', 'noopener,noreferrer');
        }} 
        className="w-full sm:w-auto bg-[#06C755] hover:bg-[#05b34c] text-white border-none shadow-sm"
      >
        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M24 10.304c0-4.579-5.383-8.304-12-8.304s-12 3.725-12 8.304c0 4.105 4.27 7.541 10.048 8.177.391.084.924.258 1.058.594.121.303.079.778.039 1.085l-.171 1.027c-.052.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.559-3.478 2.559-4.566z" />
        </svg>
        LINEで送る
      </Button>
    );

    if (params.url) {
      actions.push(
        <Button key="url" variant="ghost" onClick={() => window.open(params.url, '_blank', 'noopener,noreferrer')} className="w-full sm:w-auto">
          リンクを開く
        </Button>
      );
    }

    return actions.length > 0 ? (
      <div className="flex flex-wrap gap-3 mt-6">
        {actions}
      </div>
    ) : null;
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${getCategoryColor(result.category)}`}>
            {result.category}
          </span>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-3">{result.title}</h2>
        <p className="text-gray-600 leading-relaxed mb-6">{result.detail}</p>
        
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-tight mb-2">抽出データ</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(result.params).map(([key, value]) => {
              if (!value) return null;
              return (
                <div key={key} className="flex flex-col">
                  <span className="text-xs text-gray-500 font-medium">{key}</span>
                  <span className="text-sm text-gray-800 break-words">{String(value)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {renderActions()}
      </div>
    </div>
  );
};
