
import React, { useState, useCallback, useRef } from 'react';
import { AppState, PredictionResult } from './types';
import { analyzeImageAction } from './services/geminiService';
import { fileToBase64 } from './utils/helpers';
import { Button } from './components/Button';
import { ResultCard } from './components/ResultCard';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    image: null,
    loading: false,
    result: null,
    error: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await fileToBase64(file);
      setState(prev => ({ ...prev, image: base64, error: null, result: null }));
    } catch (err) {
      setState(prev => ({ ...prev, error: '画像の読み込みに失敗しました。' }));
    }
  };

  const handleAnalyze = async () => {
    if (!state.image) return;

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const result = await analyzeImageAction(state.image);
      setState(prev => ({ ...prev, loading: false, result }));
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: '分析に失敗しました。再度お試しください。' 
      }));
    }
  };

  const reset = () => {
    setState({
      image: null,
      loading: false,
      result: null,
      error: null,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="max-w-4xl w-full text-center mb-12">
        <div className="inline-block p-2 bg-indigo-50 rounded-2xl mb-4">
          <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-200">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
          </div>
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl mb-4">
          Action Vision AI
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          スクリーンショットをアップロードして、次の最適なアクションをインテリジェントに予測します。
        </p>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl w-full space-y-8">
        {!state.image ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="group relative bg-white border-2 border-dashed border-gray-300 rounded-3xl p-12 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all duration-300 shadow-sm"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />
            <div className="space-y-4">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                <svg className="w-8 h-8 text-gray-400 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">スクリーンショットをアップロード</p>
                <p className="text-sm text-gray-500 mt-1">または、ここをクリックしてファイルを選択</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl bg-white p-2">
              <img 
                src={state.image} 
                alt="Uploaded" 
                className="w-full h-auto max-h-[500px] object-contain rounded-2xl" 
              />
              <button 
                onClick={reset}
                className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full backdrop-blur-md transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div className="flex justify-center">
              {!state.result && (
                <Button 
                  size="lg" 
                  onClick={handleAnalyze} 
                  isLoading={state.loading}
                  className="w-full sm:w-auto min-w-[200px]"
                >
                  アクションを予測する
                </Button>
              )}
            </div>
          </div>
        )}

        {state.loading && (
          <div className="flex flex-col items-center justify-center py-12 animate-pulse">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-indigo-600 font-medium">画像を解析中...</p>
          </div>
        )}

        {state.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl flex items-center space-x-3">
            <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p className="font-medium">{state.error}</p>
          </div>
        )}

        {state.result && <ResultCard result={state.result} />}
      </div>

      {/* Footer */}
      <footer className="mt-auto pt-12 text-gray-400 text-sm">
        <p>© 2024 Action Vision AI - Built with Gemini Flash 3</p>
      </footer>
    </div>
  );
};

export default App;
