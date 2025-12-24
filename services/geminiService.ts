
import { GoogleGenAI, Type } from "@google/genai";
import { PredictionResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeImageAction = async (base64Image: string): Promise<PredictionResult> => {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    あなたは高度な画像認識とデータ構造化のエキスパートです。
    送信された画像（スクリーンショット）から、ユーザーが次に取りたいであろうアクションを推測し、
    指定されたJSON形式で返してください。
    
    カテゴリ定義:
    - Event: カレンダー登録が必要そうなイベント（会議、コンサート、予約など）
    - Product: 購入や詳細確認が必要そうな商品（服、ガジェット、本など）
    - Task: 実行すべきTODO（リマインダー、メール送信、調べ物など）
    - Place: 訪れるべき場所（レストラン、観光地、ホテルなど）
    
    paramsには、GoogleカレンダーやGoogle検索、Googleマップで使用できる具体的なパラメータを含めてください。
  `;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description: "The category of the action (Event, Product, Task, Place)",
      },
      title: {
        type: Type.STRING,
        description: "A short, descriptive title for the action",
      },
      detail: {
        type: Type.STRING,
        description: "Detailed information about the detected item and suggested action",
      },
      params: {
        type: Type.OBJECT,
        properties: {
          searchQuery: { type: Type.STRING, description: "Keyword for Google Search" },
          calendarTitle: { type: Type.STRING },
          calendarStart: { type: Type.STRING, description: "ISO 8601 formatted date/time string if available" },
          calendarEnd: { type: Type.STRING },
          calendarLocation: { type: Type.STRING },
          calendarDetails: { type: Type.STRING },
          mapQuery: { type: Type.STRING, description: "Location name or address for Google Maps" },
          url: { type: Type.STRING, description: "Relevant URL found in image" }
        },
        description: "Parameters extracted for specific tools"
      }
    },
    required: ["category", "title", "detail", "params"]
  };

  const [mimeType, base64Data] = base64Image.split(',');
  const actualMimeType = mimeType.match(/:(.*?);/)?.[1] || 'image/png';

  const result = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: "このスクリーンショットから次のアクションを予測してJSONで出力してください。" },
          { inlineData: { data: base64Data, mimeType: actualMimeType } }
        ]
      }
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema
    }
  });

  return JSON.parse(result.text || "{}");
};
