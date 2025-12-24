import { NextResponse } from 'next/server';
import { analyzeImageAction } from '@/services/geminiService';
import { PredictionResult } from '@/types';

interface RequestBody {
  base64Image?: string;
}

export async function POST(request: Request) {
  const { base64Image } = (await request.json().catch(() => ({}))) as RequestBody;

  if (!base64Image) {
    return NextResponse.json({ error: '画像データが送信されていません。' }, { status: 400 });
  }

  try {
    const result: PredictionResult = await analyzeImageAction(base64Image);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Image analysis failed:', err);
    return NextResponse.json(
      { error: err?.message || '画像分析に失敗しました。' },
      { status: 500 }
    );
  }
}
