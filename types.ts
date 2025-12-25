export enum ActionCategory {
  Event = "Event",
  Product = "Product",
  Task = "Task",
  Place = "Place",
  News = "News",
}

export interface ActionParams {
  searchQuery?: string;
  calendarTitle?: string;
  calendarStart?: string;
  calendarEnd?: string;
  calendarLocation?: string;
  calendarDetails?: string;
  mapQuery?: string;
  url?: string;
}

export interface PredictionResult {
  category: ActionCategory;
  title: string;
  detail: string;
  params: ActionParams;
}

export interface AppState {
  image: string | null;
  loading: boolean;
  result: PredictionResult | null;
  error: string | null;
}
