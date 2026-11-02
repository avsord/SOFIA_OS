export type Profile = { name: string; email: string; role: 'owner' };
export type Auth = { token: string; token_type: 'Bearer'; expires_at: string; profile: Profile; startup?: Bootstrap };
export type Bootstrap = {
  version: string; profile: Profile; expires_at: string;
  ai: { ready: boolean; reason: string | null };
  limits: { audio_bytes: number; audio_seconds: number; text_chars: number };
  capabilities: { text: boolean; voice_notes: boolean; notifications_push: boolean; multi_user: boolean; e2ee: boolean; workspace?: boolean };
};
export type VoiceDraft = { uri: string; duration: number };
export type AttachmentDraft={uri:string;name:string;mime:string;size:number;entityId?:string;attachmentId?:string};
export type Message = {
  id: string; sequence?: number; conversation_id?: string; client_id?: string;
  role: 'user' | 'assistant'; content: string; created_at: string; status: string;
  error_code?: string | null; error?: string;
  voice?: { mime: string; duration_ms: number; audio_url: string; removed?: boolean } | null;
  localVoice?: VoiceDraft;
  localAttachments?: AttachmentDraft[];
};
export type Conversation = { id: string; title: string; channel: string; state?:string; message_count?:number; created_at: string; updated_at: string };
export type MessagePage = { conversation?: Conversation; messages: Message[]; has_more: boolean };
export type ChatResult = MessagePage & { conversation_id: string; reply: string; clarification?: { id: string; options?: { id: string; label: string }[] } | null };
export type Task = { id: string; title: string; state: string; due_at?: string; planned_due_at?: string|null; start_at?:string;end_at?:string;description?:string;location?:string;color?:string; description_document?:{version:1;text:string;marks:import('./leaf-document').Mark[]};created_at?:string; revision: number; priority?: number; priority_level?: string; area?: string; notifications?: string[] };
export type Notice = { id: string; title: string; body: string; state: string; created_at: string; category?: string; entity_id?: string; local?: boolean };
export type HomeData = { tasks: Task[]; notifications: Notice[]; today_tasks: Task[]; profile: Profile };
export type AgendaItem = { tags?:string[];content?:string; id: string; title: string; kind: string; state: string; revision: number; data: { priority_level?:string;end_at?:string;remind_minutes?:number|string;start_at?: string; due_at?: string; remind_at?: string; calendar_all_day?:boolean;calendar_date_start?:string;calendar_date_end?:string; location?: string; calendar_id?:string } };
export type Tab = 'home' | 'chat' | 'pages' | 'agenda' | 'apps' | 'notifications' | 'profile';
export type Appearance = 'system' | 'light' | 'dark' | 'schedule';
export type Prefs = { appearance: Appearance; enterToSend: boolean; autoSendVoice: boolean; lightAt?: string; darkAt?: string };
export type Field = { key: string; label: string; type: string; options?: string[]; max?: number; developerOnly?: boolean };
export type Definition = { label: string; group: string; description?: string; states: string[]; fields: Field[]; private?: boolean };
export type Entity = { id: string; kind: string; title: string; content: string; area: string; state: string; privacy: string; tags: string[]; data: Record<string, any>; revision: number; updated_at?: string; created_at?: string };
export type Catalog = { catalog: Record<string, Definition>; areas: string[] };

export type ChatSnapshot=Omit<MessagePage,'conversation'> & {conversation:Conversation|null;deleted_ids:string[];current_id:string|null;cursor_revision:number};
